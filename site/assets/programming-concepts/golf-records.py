# Record and display user name records.

def record_scores():
    # Ask player names and golf scores
    print(
        "Please, input each player's name and their respective score."
        "\nWhen done type exit.\n"
    )

    player_records = ""
    while True:
        try:
            player_name = input("Player name: ").strip()
            if player_name.lower().startswith("exit"):
                print("...\nThank you for playing at Springfork Amateur Golf Club!\n")
                break
            player_score = int(input("Player score: "))
            player_records += player_name + ", " + str(player_score) + "\n"
        except ValueError:
            print("Please enter integer values only. Try again.")
            continue

    with open("../golf.txt", "w") as scores_file:
        scores_file.write(player_records)

def display_scores():
    # Display contents of golf.txt
    print("Player Scores:\n")
    with open("../golf.txt", "r") as scores_file:
        player_records = scores_file.read()

    for player in player_records.strip().split("\n"):
        print(player)

record_scores()
display_scores()
