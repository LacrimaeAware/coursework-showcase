import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.widgets import Slider
import numpy as np


def cell_edges(values):
    values = np.asarray(values, dtype=float)
    if len(values) == 1:
        return np.array([values[0]-.5, values[0]+.5])
    middle = (values[:-1]+values[1:])/2
    return np.r_[2*values[0]-middle[0], middle, 2*values[-1]-middle[-1]]


def draw_surface(E0_values, S0_values, CVbyTime, timeValues,
                 observationTime, species, sliceWidth=0):
    E0_values, S0_values = np.asarray(E0_values), np.asarray(S0_values)
    timeValues = np.asarray(timeValues)
    fig = plt.figure(2, figsize=(9.8, 6.8), facecolor='white')
    fig.clear()
    ax = fig.add_axes([.06, .22, .70, .65], projection='3d')
    enzyme, substrate = np.meshgrid(cell_edges(E0_values), cell_edges(S0_values))
    finite = CVbyTime[np.isfinite(CVbyTime)]
    maximum = finite.max() if finite.size and finite.max() > 0 else 1
    norm = Normalize(0, maximum)
    cmap = plt.get_cmap('viridis').copy()
    cmap.set_bad('lightgray')
    ax.set(xlabel=r'Initial enzyme $E_0$', ylabel=r'Initial substrate $S_0$',
           zlabel='Time', xlim=(enzyme.min(), enzyme.max()),
           ylim=(substrate.min(), substrate.max()))
    low, high = min(timeValues), max(timeValues)
    margin = (high-low)*.04 if high > low else 1
    ax.set_zlim(low-margin, high+margin)
    ax.set_xticks(E0_values[np.unique(np.rint(np.linspace(0, len(E0_values)-1, 4)).astype(int))])
    ax.set_yticks(S0_values[np.unique(np.rint(np.linspace(0, len(S0_values)-1, 4)).astype(int))])
    ax.set_zticks(timeValues)
    ax.set_box_aspect((1, 1, 1.05))
    ax.view_init(elev=19, azim=-55)
    ax.tick_params(labelsize=10)
    for label in (ax.xaxis.label, ax.yaxis.label, ax.zaxis.label):
        label.set_size(11)
    cax = fig.add_axes([.85, .30, .025, .47])
    fig.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap), cax=cax,
                 label='Relative variability (CV)')
    names = {'E': 'Free enzyme E', 'S': 'Free substrate S',
             'ES': 'Complex ES', 'P': 'Product P'}
    fig.suptitle(f'{names[species]} variability over time', fontsize=14, y=.96)
    subtitle = ('Each layer is a snapshot' if sliceWidth == 0 else
                f'Each layer uses preceding {sliceWidth:g}-unit run averages')
    fig.text(.45, .90, subtitle, ha='center', fontsize=11)
    layers = []

    def change_time(top):
        for layer in layers:
            layer.remove()
        layers.clear()
        for i, time in enumerate(timeValues):
            if time <= top:
                colors = cmap(norm(np.ma.masked_invalid(CVbyTime[:, :, i])))
                layers.append(ax.plot_surface(enzyme, substrate,
                    np.full_like(enzyme, time), facecolors=colors,
                    rstride=1, cstride=1, shade=False, linewidth=.35,
                    edgecolor=(.4, .4, .4), antialiased=False))
        fig.canvas.draw_idle()

    slider_ax = fig.add_axes([.42, .09, .28, .03])
    slider = Slider(slider_ax, 'Show layers up to time', low,
                    high if high > low else low+1, valinit=high,
                    valstep=timeValues, valfmt='%g')
    slider.on_changed(change_time)
    change_time(high)
    fig._time_slider = slider
    fig._time_layers = layers
    fig._cv_norm = norm
    return fig
