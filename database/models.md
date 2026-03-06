# Database Models

## User
- email
- password
- role (seeker | provider | admin)
- emailVerified
- createdAt

## ProviderProfile
- userId
- profession
- zone
- bio
- phone
- plan (free | plus)
- verified
- dailyViews
- portfolio
- links
- ratingAverage
- reviewsCount

## SeekerProfile
- userId
- name
- favorites
- searchHistory

## Review
- reviewerId
- providerId
- rating
- comment
- alias
- createdAt

## Verification
- userId
- dniFront
- dniBack
- selfie
- status

## Subscription
- userId
- plan
- status
- startDate
- endDate

## Banner
- title
- image
- position
- startDate
- endDate