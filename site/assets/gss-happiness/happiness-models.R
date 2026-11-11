# Model definitions from the group course analysis.
# Input: gss_sub with the prepared response, recoded predictors and factors.

lm_final <- lm(
  happy_num ~ age + educ + realinc + marital_f +
              attend + tvhours + sexfreq +
              health_rev + satjob_rev + satfin_rev,
  data = gss_sub
)


logit_model <- glm(
  high_happy ~ age + educ + realinc + marital_f +
               attend + tvhours + sexfreq +
               health_rev + satjob_rev + satfin_rev,
  data = gss_sub,
  family = binomial
)

