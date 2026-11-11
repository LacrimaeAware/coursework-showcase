# Selected calculations from the checked Homework 6 and Homework 7.
# Run with Advertising.csv in the working directory.
advertising <- read.csv("Advertising.csv")
if ("X" %in% names(advertising)) advertising$X <- NULL

model_simple <- lm(sales ~ newspaper, data = advertising)
model_multiple <- lm(sales ~ newspaper + radio, data = advertising)
print(summary(model_simple))
print(summary(model_multiple))
print(summary(model_multiple)$coefficients["newspaper", "Pr(>|t|)"])

# Homework 7: fitted values, residuals and sums of squares.
model_nr <- lm(sales ~ newspaper + radio, data = advertising)
y <- advertising$sales
ybar <- mean(y)
yhat_nr <- fitted(model_nr)
resid_nr <- residuals(model_nr)
SST_nr <- sum((y - ybar)^2)
SSR_nr <- sum((yhat_nr - ybar)^2)
SSE_nr <- sum(resid_nr^2)
print(c(SST = SST_nr, SSR = SSR_nr, SSE = SSE_nr))
print(c(explained_fraction = SSR_nr / SST_nr,
        model_r_squared = summary(model_nr)$r.squared))

# Homework 7: add TV and compare overall and individual tests.
model_all <- lm(sales ~ TV + radio + newspaper, data = advertising)
print(summary(model_all))
print(confint(model_all, level = 0.95))
print(anova(model_all))
print(cor(advertising[, c("TV", "radio", "newspaper")]))
