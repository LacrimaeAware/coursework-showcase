"""Independent SciPy computation of the current supplied Lac model.

The delivered MATLAB script is the requested implementation. This script checks
the mathematics with a separate integrator and saves inspectable numerical data.
"""
import json
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
import scipy
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm

HERE=Path(__file__).resolve().parent
ALPHA,RHO,TINPUT=100.,167.1,10.
BETA=.123*TINPUT**.6
A=ALPHA*BETA
EQX=np.sort(np.roots([1,-A,RHO,-A]).real)
EQ=np.column_stack([EQX,EQX/BETA])
LOW,SADDLE,HIGH=EQ
SCALE=HIGH-LOW
TIMES=(50.,100.,200.)
DIST_TOL=1e-5
RES_TOL=1e-8
COLORS=["#000000","#d90d1a","#a6a6a6"]


def rhs(t,z):
    x,y=z
    return np.array([BETA*y-x,ALPHA*(1+x*x)/(RHO+x*x)-y])


def jac(z):
    x=z[0]
    return np.array([[-1,BETA],[2*ALPHA*x*(RHO-1)/(RHO+x*x)**2,-1]])


def classify(z0,method="DOP853",rtol=1e-9,atol=1e-11):
    z=np.asarray(z0,dtype=float)
    if np.max(abs((z-SADDLE)/SCALE))<1e-12 and np.max(abs(rhs(0,z)/SCALE))<1e-12:
        return 3,z,0.
    prev=0.
    for end in TIMES:
        sol=solve_ivp(rhs,(prev,end),z,method=method,rtol=rtol,atol=atol)
        if not sol.success or sol.t[-1]<end or not np.all(np.isfinite(sol.y[:,-1])):
            return 3,sol.y[:,-1],sol.t[-1]
        z=sol.y[:,-1]
        if np.min(z)<-1e-8:
            return 3,z,end
        distances=[np.max(abs((z-eq)/SCALE)) for eq in (LOW,HIGH)]
        residual=np.max(abs(rhs(end,z)/SCALE))
        if residual<RES_TOL and min(distances)<DIST_TOL:
            return int(np.argmin(distances))+1,z,end
        prev=end
    return 3,z,end


def run():
    axes=np.linspace(0,10,51)
    grid=np.zeros((51,51),dtype=np.uint8)
    ends=np.zeros((51,51,2))
    ts=np.zeros((51,51))
    for row,y in enumerate(axes):
        for col,x in enumerate(axes):
            grid[row,col],ends[row,col],ts[row,col]=classify([x,y])
    print("Base labels:",np.unique(grid,return_counts=True),flush=True)
    refined=set()
    for row in range(50):
        for col in range(50):
            corners=grid[row:row+2,col:col+2]
            if 3 in corners or len(np.unique(corners))>1:
                for x in np.linspace(axes[col],axes[col+1],3):
                    for y in np.linspace(axes[row],axes[row+1],3):
                        refined.add((round(float(x),10),round(float(y),10)))
    refined=np.array([[x,y,classify([x,y])[0]] for x,y in sorted(refined)])
    comparison=[]
    # Different algorithm and tighter tolerances at EVERY added boundary point.
    for x,y,label in refined:
        other=classify([x,y],method="Radau",rtol=2e-10,atol=2e-12)[0]
        comparison.append(int(label)==other)
    assert all(comparison),"Boundary classification depends on the numerical solver."
    print("Boundary points and solver agreement:",len(refined),sum(comparison),flush=True)
    # Mirror MATLAB data products, independently generated.
    np.savetxt(HERE/"lac_basin_matrix_python.csv",grid,delimiter=",",fmt="%d")
    np.savetxt(HERE/"lac_boundary_refinement.csv",refined,delimiter=",",header="X0,Y0,label",comments="")
    np.savez_compressed(HERE/"lac_basin_numerics.npz",axes=axes,basin=grid,endpoints=ends,final_time=ts,refined=refined)
    eig=np.array([np.linalg.eigvals(jac(e)) for e in EQ])
    zfold=(RHO-3+np.array([-1,1])*np.sqrt((RHO-9)*(RHO-1)))/2
    xfold=np.sqrt(zfold)
    afold=xfold*(RHO+xfold**2)/(1+xfold**2)
    tfold=(afold/(ALPHA*.123))**(1/.6)
    result=dict(parameters=dict(alpha=ALPHA,rho=RHO,external_input_T=TINPUT,beta=BETA,numerator_constant=1),
        equilibria=EQ.tolist(),eigenvalues=eig.tolist(),
        fold_X=xfold.tolist(),fold_A=afold.tolist(),bistable_input_interval=sorted(tfold.tolist()),
        grid=dict(shape=[51,51],x_range=[0,10],y_range=[0,10],spacing=.2,
            lower=int(np.sum(grid==1)),upper=int(np.sum(grid==2)),unresolved=int(np.sum(grid==3)),
            maximum_final_time=float(ts.max()),time_extended=int(np.sum(ts>50))),
        refinement=dict(points=len(refined),
            additional_points=int(np.sum(~np.all(np.isclose(refined[:,:2]/.2,np.round(refined[:,:2]/.2)),axis=1))),
            repeated_coarse_points=int(np.sum(np.all(np.isclose(refined[:,:2]/.2,np.round(refined[:,:2]/.2)),axis=1))),
            lower=int(np.sum(refined[:,2]==1)),upper=int(np.sum(refined[:,2]==2)),
            unresolved=int(np.sum(refined[:,2]==3)),DOP853_Radau_agreement=sum(comparison),spacing=.1),
        criteria=dict(normalized_endpoint_tolerance=DIST_TOL,normalized_residual_tolerance=RES_TOL,
            time_limits=TIMES,scale=SCALE.tolist()),
        runtime=dict(scipy=scipy.__version__,primary_solver="DOP853",boundary_crosscheck="Radau",
            matlab="Not verified: neither MATLAB nor Octave executable found in PATH; standard MATLAB installation directory absent."),
        saddle_label=classify(SADDLE)[0])
    (HERE/"simulation_results.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
    cmap=ListedColormap(COLORS)
    fig,axs=plt.subplots(1,2,figsize=(10,4.6),layout="constrained")
    norm=BoundaryNorm([.5,1.5,2.5,3.5],3)
    axs[0].imshow(grid,origin="lower",extent=[-.1,10.1,-.1,10.1],cmap=cmap,norm=norm,interpolation="nearest",aspect="equal")
    axs[0].set(xlim=(0,10),ylim=(0,10),xlabel="Initial internal TMG, X(0)",ylabel="Initial LacY, Y(0)",title="Every coarse-grid initial state")
    axs[0].scatter(*LOW,s=35,c="white",edgecolors="#1d4ed8",zorder=5)
    axs[0].scatter(*SADDLE,s=40,c="white",edgecolors="#1d4ed8",marker="D",zorder=5)
    axs[1].scatter(refined[:,0],refined[:,1],c=refined[:,2],cmap=cmap,norm=norm,s=10,marker="s")
    axs[1].set(xlim=(0,10),ylim=(0,10),xlabel="Initial internal TMG, X(0)",ylabel="Initial LacY, Y(0)",title="Additional boundary sampling")
    axs[1].set_aspect("equal")
    fig.suptitle("Fixed input T = 10: black = lower, red = upper, gray = unresolved",fontsize=11)
    fig.savefig(HERE/"lac_basins.svg")
    fig.savefig(HERE/"lac_basins.png",dpi=150)
    plt.close(fig)
    initials=np.array([[0,0],[1,1],[2,2],[3,7],[4,7],[8,8],[10,0],[0,10]],float)
    fig,axs=plt.subplots(1,2,figsize=(10,4.5),layout="constrained")
    for seed in initials:
        sol=solve_ivp(rhs,(0,50),seed,t_eval=np.linspace(0,50,1001),method="DOP853",rtol=1e-10,atol=1e-12)
        label=classify(seed)[0]
        positive=sol.y[1]>0
        axs[0].semilogy(sol.t[positive],sol.y[1,positive],color=COLORS[label-1],alpha=.8,lw=1.2)
        positive=np.all(sol.y>0,axis=0)
        axs[1].loglog(sol.y[0,positive],sol.y[1,positive],color=COLORS[label-1],alpha=.8,lw=1.2)
    axs[0].set(xlabel="Time",ylabel="LacY, Y(t)",title="LacY time courses")
    axs[1].scatter(LOW[0],LOW[1],c="black",s=35,zorder=5)
    axs[1].scatter(HIGH[0],HIGH[1],c="#d90d1a",s=35,zorder=5)
    axs[1].scatter(SADDLE[0],SADDLE[1],c="#1d4ed8",s=35,marker="D",zorder=5)
    axs[1].set(xlabel="Internal TMG, X(t)",ylabel="LacY, Y(t)",title="Phase plane, positive states")
    for ax in axs:
        ax.grid(alpha=.18)
    fig.savefig(HERE/"lac_trajectories.svg")
    fig.savefig(HERE/"lac_trajectories.png",dpi=150)
    plt.close(fig)
    print(json.dumps(result,indent=2),flush=True)


if __name__=="__main__":
    run()
