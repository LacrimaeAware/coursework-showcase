from tensorflow.keras import layers, models

def build_model():
    model = models.Sequential([layers.Input(shape=(200, 200, 1)), layers.Conv2D(16, 3, activation='relu', name='conv1'), layers.MaxPooling2D(), layers.Conv2D(32, 3, activation='relu', name='conv2'), layers.MaxPooling2D(), layers.Conv2D(64, 3, activation='relu', name='conv3'), layers.GlobalAveragePooling2D(), layers.Dense(32, activation='relu'), layers.Dense(1, activation='sigmoid')])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model
