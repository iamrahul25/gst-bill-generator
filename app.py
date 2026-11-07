import os
import subprocess

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


def start_app():
    try:
        subprocess.run("npm run dev", shell=True, cwd=PROJECT_DIR)
    except KeyboardInterrupt:
        pass


def main():
    while True:
        print("\n1. Start the app")
        print("0. Exit")
        choice = input("Choose an option: ").strip()

        if choice == "1":
            start_app()
        elif choice == "0":
            break
        else:
            print("Invalid option.")


if __name__ == "__main__":
    main()
