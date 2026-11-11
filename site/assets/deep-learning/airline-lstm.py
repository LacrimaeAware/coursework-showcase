# problem1_airline_lstm_pimped.py

import os
os.environ.setdefault("KERAS_BACKEND", "tensorflow")

from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error

# Prefer standalone Keras. Fall back to tf.keras if needed.
try:
    import keras
    from keras import layers
except Exception:
    import tensorflow as tf
    keras = tf.keras
    layers = tf.keras.layers


# -------------------------------------------------------
# Settings
# -------------------------------------------------------
SEED = 42
SHOW_PLOTS = True

np.random.seed(SEED)
keras.utils.set_random_seed(SEED)

OUT_DIR = Path("problem1_outputs")
OUT_DIR.mkdir(exist_ok=True)


# -------------------------------------------------------
# Load data
# -------------------------------------------------------
url = "https://raw.githubusercontent.com/jbrownlee/Datasets/master/airline-passengers.csv"

df = pd.read_csv(url)
df["Month"] = pd.to_datetime(df["Month"])
df = df.sort_values("Month").reset_index(drop=True)

passengers = df["Passengers"].astype("float32").to_numpy()
dates = df["Month"].to_numpy()

n = len(df)

test_start_idx = int(n * 0.75)
val_start_idx = int(test_start_idx * 0.80)

print("\nDataset")
print("-------")
print(df.head())
print(df.tail())
print(f"Total rows: {n}")

print("\nChronological split")
print("-------------------")
print(f"Train period: {df.loc[0, 'Month'].date()} to {df.loc[val_start_idx - 1, 'Month'].date()}")
print(f"Val period:   {df.loc[val_start_idx, 'Month'].date()} to {df.loc[test_start_idx - 1, 'Month'].date()}")
print(f"Test period:  {df.loc[test_start_idx, 'Month'].date()} to {df.loc[n - 1, 'Month'].date()}")


# -------------------------------------------------------
# Transform target
# -------------------------------------------------------
# log1p helps because the series grows over time and the seasonal spikes get larger.
log_passengers = np.log1p(passengers).reshape(-1, 1)

scaler = MinMaxScaler()
scaler.fit(log_passengers[:val_start_idx])

scaled_log_passengers = scaler.transform(log_passengers).ravel()


# -------------------------------------------------------
# Extra time features
# -------------------------------------------------------
month_num = df["Month"].dt.month.to_numpy()

month_sin = np.sin(2 * np.pi * month_num / 12)
month_cos = np.cos(2 * np.pi * month_num / 12)

trend = np.arange(n, dtype="float32") / n


def build_feature_matrix(dynamic_scaled_passengers):
    """
    Each timestep contains:
    1. scaled log passengers
    2. month_sin
    3. month_cos
    4. trend
    """
    return np.column_stack([
        dynamic_scaled_passengers,
        month_sin,
        month_cos,
        trend
    ]).astype("float32")


features = build_feature_matrix(scaled_log_passengers)


def make_windows(feature_matrix, target_scaled, dates_array, lookback, target_start, target_end):
    X = []
    y = []
    target_dates = []
    target_indices = []

    for target_idx in range(max(lookback, target_start), target_end):
        X.append(feature_matrix[target_idx - lookback:target_idx])
        y.append(target_scaled[target_idx])
        target_dates.append(dates_array[target_idx])
        target_indices.append(target_idx)

    return (
        np.array(X, dtype="float32"),
        np.array(y, dtype="float32"),
        np.array(target_dates),
        np.array(target_indices)
    )


def inverse_to_passengers(scaled_values):
    scaled_values = np.asarray(scaled_values).reshape(-1, 1)
    log_values = scaler.inverse_transform(scaled_values).ravel()
    return np.expm1(log_values)


def seasonal_naive(target_indices):
    """
    Baseline prediction:
    predict this month using same month from previous year.
    """
    return passengers[target_indices - 12]


# -------------------------------------------------------
# Model helpers
# -------------------------------------------------------
def build_model(input_shape, config):
    model = keras.Sequential(name=config["name"])
    model.add(layers.Input(shape=input_shape))

    if config["units2"] is not None:
        model.add(layers.LSTM(config["units1"], return_sequences=True))
        model.add(layers.Dropout(config["dropout"]))
        model.add(layers.LSTM(config["units2"]))
    else:
        model.add(layers.LSTM(config["units1"]))

    model.add(layers.Dropout(config["dropout"]))
    model.add(layers.Dense(config["dense"], activation="relu"))
    model.add(layers.Dense(1))

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=config["lr"]),
        loss="mse",
        metrics=["mae"]
    )

    return model


class PrintEveryN(keras.callbacks.Callback):
    def __init__(self, every=10):
        super().__init__()
        self.every = every

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}

        if epoch == 0 or (epoch + 1) % self.every == 0:
            print(
                f"epoch {epoch + 1:03d} | "
                f"loss={logs.get('loss'):.5f} | "
                f"mae={logs.get('mae'):.5f} | "
                f"val_loss={logs.get('val_loss'):.5f} | "
                f"val_mae={logs.get('val_mae'):.5f}"
            )


configs = [
    {
        "name": "lstm_32_lookback12",
        "lookback": 12,
        "units1": 32,
        "units2": None,
        "dense": 16,
        "dropout": 0.05,
        "lr": 0.001,
        "batch_size": 8,
    },
    {
        "name": "lstm_64_lookback24",
        "lookback": 24,
        "units1": 64,
        "units2": None,
        "dense": 32,
        "dropout": 0.10,
        "lr": 0.001,
        "batch_size": 8,
    },
    {
        "name": "stacked_lstm_64_32_lookback24",
        "lookback": 24,
        "units1": 64,
        "units2": 32,
        "dense": 32,
        "dropout": 0.15,
        "lr": 0.001,
        "batch_size": 8,
    },
    {
        "name": "stacked_lstm_96_48_lookback24",
        "lookback": 24,
        "units1": 96,
        "units2": 48,
        "dense": 48,
        "dropout": 0.20,
        "lr": 0.0007,
        "batch_size": 8,
    },
]


# -------------------------------------------------------
# Train several LSTM versions, choose best by validation MAE
# -------------------------------------------------------
runs = []
summary_rows = []

for config in configs:
    lookback = config["lookback"]

    print("\n" + "=" * 70)
    print(f"Training config: {config['name']}")
    print("=" * 70)

    X_train, y_train, train_dates, train_indices = make_windows(
        features,
        scaled_log_passengers,
        dates,
        lookback,
        lookback,
        val_start_idx
    )

    X_val, y_val, val_dates, val_indices = make_windows(
        features,
        scaled_log_passengers,
        dates,
        lookback,
        val_start_idx,
        test_start_idx
    )

    X_test, y_test, test_dates, test_indices = make_windows(
        features,
        scaled_log_passengers,
        dates,
        lookback,
        test_start_idx,
        n
    )

    print("Shapes")
    print("------")
    print("X_train:", X_train.shape)
    print("X_val:  ", X_val.shape)
    print("X_test: ", X_test.shape)

    model = build_model(input_shape=X_train.shape[1:], config=config)

    early_stopping = keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=40,
        restore_best_weights=True
    )

    reduce_lr = keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=15,
        min_lr=1e-5
    )

    history = model.fit(
        X_train,
        y_train,
        validation_data=(X_val, y_val),
        epochs=400,
        batch_size=config["batch_size"],
        callbacks=[early_stopping, reduce_lr, PrintEveryN(every=10)],
        verbose=0
    )

    val_pred_scaled = model.predict(X_val, verbose=0).ravel()

    y_val_original = inverse_to_passengers(y_val)
    val_pred_original = inverse_to_passengers(val_pred_scaled)

    val_mae_original = mean_absolute_error(y_val_original, val_pred_original)

    best_epoch = int(np.argmin(history.history["val_loss"]) + 1)
    best_val_loss = float(np.min(history.history["val_loss"]))

    print("\nValidation result")
    print("-----------------")
    print(f"Best epoch:              {best_epoch}")
    print(f"Best val_loss, scaled:   {best_val_loss:.5f}")
    print(f"Validation MAE original: {val_mae_original:.2f} thousand passengers")

    run = {
        "config": config,
        "model": model,
        "history": history,
        "X_test": X_test,
        "y_test": y_test,
        "test_dates": test_dates,
        "test_indices": test_indices,
        "val_mae_original": val_mae_original,
        "best_val_loss": best_val_loss,
        "best_epoch": best_epoch,
    }

    runs.append(run)

    summary_rows.append({
        "name": config["name"],
        "lookback": lookback,
        "best_epoch": best_epoch,
        "best_val_loss_scaled": best_val_loss,
        "val_mae_thousand_passengers": val_mae_original,
    })


summary_df = pd.DataFrame(summary_rows)
summary_df = summary_df.sort_values("val_mae_thousand_passengers")

summary_path = OUT_DIR / "problem1_training_runs.csv"
summary_df.to_csv(summary_path, index=False)

print("\n\nModel comparison, chosen using validation only")
print("---------------------------------------------")
print(summary_df)

best_name = summary_df.iloc[0]["name"]
best_run = next(run for run in runs if run["config"]["name"] == best_name)

print("\nBest model")
print("----------")
print(best_name)


# -------------------------------------------------------
# Final test evaluation for best model
# -------------------------------------------------------
best_model = best_run["model"]
best_config = best_run["config"]
best_history = best_run["history"]

X_test = best_run["X_test"]
y_test = best_run["y_test"]
test_dates = best_run["test_dates"]
test_indices = best_run["test_indices"]

test_loss_scaled, test_mae_scaled = best_model.evaluate(X_test, y_test, verbose=0)

test_pred_scaled = best_model.predict(X_test, verbose=0).ravel()

y_test_original = inverse_to_passengers(y_test)
test_pred_original = inverse_to_passengers(test_pred_scaled)

test_mae_original = mean_absolute_error(y_test_original, test_pred_original)

baseline_test_pred = seasonal_naive(test_indices)
baseline_test_mae = mean_absolute_error(y_test_original, baseline_test_pred)

improvement = ((baseline_test_mae - test_mae_original) / baseline_test_mae) * 100


# -------------------------------------------------------
# Recursive forecast
# -------------------------------------------------------
# This is stricter than one-step prediction.
# It starts at the test set and feeds the model's own predictions forward.
lookback = best_config["lookback"]
dynamic_scaled = scaled_log_passengers.copy()
recursive_scaled_preds = []

for target_idx in range(test_start_idx, n):
    dynamic_features = build_feature_matrix(dynamic_scaled)

    X_window = dynamic_features[target_idx - lookback:target_idx]
    X_window = X_window[np.newaxis, :, :]

    pred_scaled = float(best_model.predict(X_window, verbose=0)[0, 0])

    recursive_scaled_preds.append(pred_scaled)
    dynamic_scaled[target_idx] = pred_scaled

recursive_pred_original = inverse_to_passengers(recursive_scaled_preds)
recursive_test_mae = mean_absolute_error(passengers[test_start_idx:n], recursive_pred_original)


print("\nFinal Test Results")
print("------------------")
print(f"Best model:                         {best_name}")
print(f"Test MSE loss, scaled:              {test_loss_scaled:.5f}")
print(f"Test MAE, scaled:                   {test_mae_scaled:.5f}")
print(f"LSTM one-step test MAE:             {test_mae_original:.2f} thousand passengers")
print(f"Seasonal naive baseline test MAE:   {baseline_test_mae:.2f} thousand passengers")
print(f"Improvement over seasonal baseline: {improvement:.2f}%")
print(f"Recursive forecast test MAE:        {recursive_test_mae:.2f} thousand passengers")


# -------------------------------------------------------
# Save predictions
# -------------------------------------------------------
predictions_df = pd.DataFrame({
    "Month": test_dates,
    "Actual": y_test_original,
    "LSTM_one_step_prediction": test_pred_original,
    "Seasonal_naive_prediction": baseline_test_pred,
    "Recursive_LSTM_prediction": recursive_pred_original[:len(test_dates)],
    "One_step_error": y_test_original - test_pred_original,
    "Baseline_error": y_test_original - baseline_test_pred,
})

predictions_path = OUT_DIR / "problem1_predictions.csv"
predictions_df.to_csv(predictions_path, index=False)

print("\nFirst test predictions")
print("----------------------")
print(predictions_df.head(12))

print("\nSaved files")
print("-----------")
print(summary_path)
print(predictions_path)


# -------------------------------------------------------
# Plot 1: loss curve for best model
# -------------------------------------------------------
plt.figure(figsize=(8, 5))
plt.plot(best_history.history["loss"], label="Training loss")
plt.plot(best_history.history["val_loss"], label="Validation loss")
plt.xlabel("Epoch")
plt.ylabel("MSE loss")
plt.title(f"Problem 1: Training and Validation Loss\nBest model: {best_name}")
plt.legend()
plt.tight_layout()

loss_plot_path = OUT_DIR / "problem1_best_loss_curve.png"
plt.savefig(loss_plot_path, dpi=200)

if SHOW_PLOTS:
    plt.show()
else:
    plt.close()


# -------------------------------------------------------
# Plot 2: full series with test predictions
# -------------------------------------------------------
plt.figure(figsize=(11, 5))
plt.plot(df["Month"], passengers, label="Actual passengers")
plt.plot(test_dates, test_pred_original, label="LSTM one-step test forecast")
plt.plot(test_dates, baseline_test_pred, linestyle="--", label="Seasonal naive baseline")
plt.axvline(df.loc[test_start_idx, "Month"], linestyle="--", label="Test set begins")
plt.xlabel("Month")
plt.ylabel("Passengers, thousands")
plt.title("Problem 1: Airline Passenger Forecast")
plt.legend()
plt.tight_layout()

forecast_plot_path = OUT_DIR / "problem1_full_forecast.png"
plt.savefig(forecast_plot_path, dpi=200)

if SHOW_PLOTS:
    plt.show()
else:
    plt.close()


# -------------------------------------------------------
# Plot 3: zoomed test comparison
# -------------------------------------------------------
plt.figure(figsize=(11, 5))
plt.plot(test_dates, y_test_original, marker="o", label="Actual test values")
plt.plot(test_dates, test_pred_original, marker="o", label="LSTM one-step prediction")
plt.plot(test_dates, baseline_test_pred, marker="o", linestyle="--", label="Seasonal naive baseline")
plt.plot(test_dates, recursive_pred_original[:len(test_dates)], marker="o", linestyle=":", label="Recursive LSTM forecast")
plt.xlabel("Month")
plt.ylabel("Passengers, thousands")
plt.title("Problem 1: Test Set Forecast Comparison")
plt.legend()
plt.tight_layout()

comparison_plot_path = OUT_DIR / "problem1_test_forecast_comparison.png"
plt.savefig(comparison_plot_path, dpi=200)

if SHOW_PLOTS:
    plt.show()
else:
    plt.close()


print(loss_plot_path)
print(forecast_plot_path)
print(comparison_plot_path)

print("\nDone.")