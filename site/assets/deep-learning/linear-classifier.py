import numpy as np
import matplotlib.pyplot as plt
np.random.seed(0)
n_samples = 100
class0 = np.random.randn(n_samples, 2) + np.array([-1.5, -1.5])
class1 = np.random.randn(n_samples, 2) + np.array([1.5, 1.5])
X = np.vstack([class0, class1])
y = np.hstack([np.zeros(n_samples), np.ones(n_samples)])
print('Dataset shape:', X.shape)
plt.figure()
plt.scatter(class0[:, 0], class0[:, 1])
plt.scatter(class1[:, 0], class1[:, 1])
plt.title('Synthetic Dataset')
plt.xlabel('x1')
plt.ylabel('x2')
plt.show()

def predict(theta, b, X):
    """
    Computes predictions for all points in X given parameters theta and b.
    theta defines orientation of normal vector k.
    b shifts the decision boundary.
    """
    k = np.array([np.cos(theta), np.sin(theta)])
    scores = X @ k + b
    return (scores >= 0).astype(int)

def zero_one_loss(theta, b, X, y):
    """
    Computes fraction of misclassified points.
    """
    preds = predict(theta, b, X)
    return np.mean(preds != y)
theta_values = np.linspace(0, np.pi, 120)
b_values = np.linspace(-6, 6, 80)
loss_surface = np.zeros((len(theta_values), len(b_values)))
for i, theta in enumerate(theta_values):
    for j, b in enumerate(b_values):
        loss_surface[i, j] = zero_one_loss(theta, b, X, y)
min_index = np.unravel_index(np.argmin(loss_surface), loss_surface.shape)
best_theta = theta_values[min_index[0]]
best_b = b_values[min_index[1]]
best_loss = loss_surface[min_index]
print('Best theta:', best_theta)
print('Best b:', best_b)
print('Minimum error rate:', best_loss)
best_k = np.array([np.cos(best_theta), np.sin(best_theta)])
x_vals = np.linspace(-5, 5, 200)
y_vals = -(best_k[0] * x_vals + best_b) / best_k[1]
plt.figure()
plt.scatter(class0[:, 0], class0[:, 1])
plt.scatter(class1[:, 0], class1[:, 1])
plt.plot(x_vals, y_vals, 'g--', linewidth=2)
plt.title('Best Decision Boundary')
plt.xlabel('x1')
plt.ylabel('x2')
plt.show()
plt.figure()
plt.contourf(np.degrees(theta_values), b_values, loss_surface.T)
plt.plot(np.degrees(best_theta), best_b, 'r*', markersize=12)
plt.colorbar(label='Misclassification Rate')
plt.xlabel('Theta (degrees)')
plt.ylabel('b')
plt.title('Loss Surface')
plt.show()
