"""Compare the supplied enzyme network's exact SSA with its mass-action ODE.

All count and rate settings are illustrative. The deterministic curve is not
claimed to equal the nonlinear stochastic ensemble mean. Run this file from
any directory; outputs stay beside the script unless --output is specified.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from scipy.integrate import solve_ivp

from gillespie_demo import ENZYME_CHANGES, ENZYME_INITIAL, ENZYME_RATES, enzyme_ensemble


def enzyme_rhs(time, state, rates):
    e, s, es, _ = state
    flux = np.array([rates[0]*e*s, rates[1]*es, rates[2]*es])
    return flux @ ENZYME_CHANGES


def compare(runs=500, seed=1030, scale=1, end_time=20.0):
    if not isinstance(scale,int) or scale < 1:
        raise ValueError('scale must be a positive integer')
    initial=ENZYME_INITIAL*scale
    rates=ENZYME_RATES.copy()
    rates[0]/=scale
    grid,paths=enzyme_ensemble('ssa',runs=runs,seed=seed,initial=initial,
                              rates=rates,end_time=end_time,observations=201)
    ode=solve_ivp(enzyme_rhs,(0,end_time),initial,t_eval=grid,args=(rates,),
                  method='DOP853',rtol=1e-10,atol=1e-11)
    assert ode.success
    assert np.all(paths>=0)
    assert np.all(paths[:,:,0]+paths[:,:,2]==initial[0]+initial[2])
    assert np.all(paths[:,:,1]+paths[:,:,2]+paths[:,:,3]==initial[1]+initial[2]+initial[3])
    assert np.max(abs(ode.y[0]+ode.y[2]-(initial[0]+initial[2])))<1e-7
    assert np.max(abs(ode.y[1]+ode.y[2]+ode.y[3]-(initial[1]+initial[2]+initial[3])))<1e-7
    assert np.min(ode.y)>-1e-8
    for state in ([10.,40.,0.,0.],[6.,18.,4.,18.],[10.,0.,0.,40.]):
        derivative=enzyme_rhs(0,np.array(state),ENZYME_RATES)
        assert abs(derivative[0]+derivative[2])<1e-12
        assert abs(derivative[1]+derivative[2]+derivative[3])<1e-12
    normalized=paths/scale
    deterministic=ode.y.T/scale
    return grid,normalized,deterministic


def run(output,runs=500,seed=1030):
    if not isinstance(runs,int) or runs<2:
        raise ValueError('Use at least two runs to report ensemble standard deviation and standard error.')
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    fig,axes=plt.subplots(1,2,figsize=(10.8,4.2),layout='constrained')
    summary={'generated_from':'same three-channel enzyme network in gillespie_demo.py',
             'command':'python Learning Lab/Python/compare_enzyme_ode.py',
             'seed':seed,'runs':runs,'settings':'Illustrative, not specified by the supplied paper',
             'interpretation':'Pointwise run-to-run percentile band; ODE is a deterministic approximation, not an exact stochastic mean',
             'scales':[]}
    for ax,scale in zip(axes,[1,10]):
        grid,paths,ode=compare(runs,seed,scale)
        product=paths[:,:,3]
        lo,hi=np.quantile(product,[.025,.975],axis=0)
        mean=product.mean(axis=0)
        ax.fill_between(grid,lo,hi,color='#187f78',alpha=.18,label='Pointwise 95% simulation band')
        ax.step(grid,product[0],where='post',color='#b87829',alpha=.8,lw=1,label='One stochastic run')
        ax.plot(grid,mean,color='#187f78',lw=1.8,label='Mean of simulated runs')
        ax.plot(grid,ode[:,3],color='#283e56',ls='--',lw=1.8,label='Mass-action ODE')
        ax.set(title=f'System size multiplier {scale}',xlabel='Time (illustrative units)',
               ylabel='Product count / system size multiplier',ylim=(0,42))
        ax.spines[['top','right']].set_visible(False)
        ax.grid(axis='y',alpha=.15)
        ax.legend(fontsize=7.5,loc='upper left',frameon=False)
        summary['scales'].append({'scale':scale,'final_ode_product':float(ode[-1,3]),
             'final_ensemble_mean':float(mean[-1]),'final_ensemble_sd':float(product[:,-1].std(ddof=1)),
             'final_mean_standard_error':float(product[:,-1].std(ddof=1)/np.sqrt(runs)),
             'conservation':'pass','nonnegative_counts':'pass'})
        np.savez_compressed(output/f'enzyme_comparison_scale_{scale}.npz',time=grid,paths=paths,ode=ode)
    fig.savefig(output/'enzyme_deterministic_stochastic.png',dpi=180)
    plt.close(fig)
    assert abs(summary['scales'][0]['final_ode_product']-summary['scales'][1]['final_ode_product'])<1e-7
    (output/'enzyme_comparison.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    print(json.dumps(summary,indent=2))
    return summary


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'enzyme-comparison')
    parser.add_argument('--runs',type=int,default=500)
    parser.add_argument('--seed',type=int,default=1030)
    args=parser.parse_args()
    run(args.output,args.runs,args.seed)
