import numpy as np
x1, x2 = (1, -1)
theta = np.array([0.1, 0.4, -0.3], dtype=float)
alpha = 0.5
y_true = 1

def sigmoid(z):
    return 1 / (1 + np.exp(-z))
z = theta[0] + theta[1] * x1 + theta[2] * x2
y_hat = sigmoid(z)
loss = 0.5 * (y_hat - y_true) ** 2
print('z =', z)
print('y_hat =', y_hat)
print('loss =', loss)
dL_dz = (y_hat - y_true) * y_hat * (1 - y_hat)
grad = np.array([dL_dz * 1, dL_dz * x1, dL_dz * x2])
theta_new = theta - alpha * grad
print('Updated weights:', theta_new)
x = np.array([1, 1, 0], dtype=float)
y_true = 1
W_hidden = np.array([[1, 1, 1], [-1, -1, -1]], dtype=float)
v = np.array([1, -1, 1], dtype=float)
alpha = 0.5
z_hidden = W_hidden @ x
a_hidden = sigmoid(z_hidden)
x_out = np.array([1, a_hidden[0], a_hidden[1]])
z_out = v @ x_out
y_hat = sigmoid(z_out)
loss = 0.5 * (y_hat - y_true) ** 2
print('Hidden activations:', a_hidden)
print('Output:', y_hat)
print('Loss:', loss)
delta_out = (y_hat - y_true) * y_hat * (1 - y_hat)
delta_hidden = delta_out * v[1:] * a_hidden * (1 - a_hidden)
grad_v = delta_out * x_out
grad_W_hidden = np.zeros_like(W_hidden)
grad_W_hidden[0] = delta_hidden[0] * x
grad_W_hidden[1] = delta_hidden[1] * x
v_new = v - alpha * grad_v
W_hidden_new = W_hidden - alpha * grad_W_hidden
print('Updated output weights:', v_new)
print('Updated hidden weights:\n', W_hidden_new)
