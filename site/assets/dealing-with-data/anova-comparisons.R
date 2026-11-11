# Selected models from Homework 3 and the final Homework 4 review.
# Run with homework3.csv in the working directory.
advertisement <- c(5, 1, 11, 2, 8)
muzak <- c(0, 1, 4, 6, 3)
classical <- c(13, 9, 8, 15, 7)
holding_times <- data.frame(
  Time = c(advertisement, muzak, classical),
  Recording = factor(rep(c("Advertisement", "Muzak", "Classical"), each = 5))
)
model_hold <- aov(Time ~ Recording, data = holding_times)
print(summary(model_hold))

homework3 <- read.csv("homework3.csv")
homework3$State <- as.factor(homework3$State)
model_price <- aov(Price ~ State, data = homework3)
print(summary(model_price))
tuk <- TukeyHSD(model_price)
print(tuk)
print(tuk$State[order(tuk$State[, "p adj"]), ])

# The constructed Homework 4 comparison has equal sample means.
advert.times <- c(5, 6, 4, 5, 5)
muzak.times <- c(5, 4, 6, 5, 5)
classic.times <- c(5, 5, 4, 6, 5)
madeup.df <- rbind(
  data.frame(Recording = "Advertising", Hold.Times = advert.times),
  data.frame(Recording = "Muzak", Hold.Times = muzak.times),
  data.frame(Recording = "Classical", Hold.Times = classic.times)
)
anova_hold <- aov(Hold.Times ~ Recording, data = madeup.df)
print(summary(anova_hold))
print(TukeyHSD(anova_hold))
