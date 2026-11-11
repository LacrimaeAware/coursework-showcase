const chapter = location.hash === "#variability" ? "06-product-variability.html" : location.hash === "#trajectories" || location.hash === "#model" ? "05-stochastic-reactions.html" : "index.html";
location.replace("../../courses/systems-biology/" + chapter + (location.hash === "#model" ? "#model" : ""));
