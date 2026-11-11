import math
from torch import nn

class ClockNet(nn.Module):

    def __init__(self):
        super().__init__()
        self.conv = nn.Sequential(nn.Conv2d(1, 16, kernel_size=3, padding=1), nn.BatchNorm2d(16), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(16, 32, kernel_size=3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(32, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(64, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.AdaptiveAvgPool2d(4))
        self.fc = nn.Sequential(nn.Flatten(), nn.Linear(1024, 64), nn.ReLU(), nn.Dropout(0.3), nn.Linear(64, 2))

    def forward(self, x):
        return self.fc(self.conv(x))

def sincos_to_minutes(sin_val, cos_val, total=720):
    """Convert (sin, cos) prediction back to total minutes."""
    angle = math.atan2(sin_val, cos_val)
    if angle < 0:
        angle += 2 * math.pi
    return angle / (2 * math.pi) * total

def circ_err_minutes(true_min, pred_min, total=720):
    """Circular error in minutes (handles wrap-around)."""
    d = abs(true_min - pred_min)
    return min(d, total - d)
