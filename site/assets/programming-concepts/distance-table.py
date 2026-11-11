# Calculate distance traveled by vehicle

# Get vehicle variables
vehicle_speed = int(input("What is the speed of the vehicle? "))
vehicle_time = int(input("How many hours has the vehicle travelled? "))

# Display distance travelled by hour
print("Hour", " "*4, "Distance Travelled")
for i in range(1, vehicle_time+1):
    print(i, " "*(8-len(str(i))), vehicle_speed*i)
