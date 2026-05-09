import asyncio
import edge_tts
import speech_recognition as sr
import pygame as pg
import os

# konfiguracja glosu i pliku tymczasowego
VOICE = "pl-PL-MarekNeural" 
OUTPUT_FILE = "response.mp3"

# funkcja ktora zamienia tekst na mowe i odtwarza go
async def speak(text):
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(OUTPUT_FILE)
    
    pg.mixer.init()
    pg.mixer.music.load(OUTPUT_FILE)
    pg.mixer.music.play()
    
    while pg.mixer.music.get_busy():
        await asyncio.sleep(0.1)
    
    pg.mixer.quit()
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)

# funkcja do nasluchiwania mowy uzytkownika
def listen_for_command():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        # redukcja szumow otoczenia
        recognizer.adjust_for_ambient_noise(source, duration=1)
        print("slucham...") # znak ze mozna mowic
        audio = recognizer.listen(source, timeout=None, phrase_time_limit=None)

    try:
        result = recognizer.recognize_google(audio, language="pl-PL")
        return result.lower()
    except Exception:
        return ""

async def main():
    print("uruchamianie asystenta...")
    
    # definicje zwrotow asystenta
    welcome_text = "cześć to twoj wirtualny asystent. skonfiguruj poprawnie ustawienie kamer żeby rozpocząć. " \
    "jak już bedziesz gotowy to wypowiedz wyraźnie komendę start a zacznę odliczanie powtórzeń"
    misunderstood_text = "nie zrozumiałem co powiedziałeś. czy mogłbyś powtórzyć?"
    correct_camera_set_text = "masz prawidlowo skonfigurowane kamery, zaczynam odliczanie"
    incorrect_camera_set_text = "masz nieprawidłowo skonfigurowane kamery, popraw swoje ustawienie"


    # powitanie na starcie
    await speak(welcome_text)
    camera_set = True # flaga stanu kamer do testow 

    while True:
        while not camera_set:
            await asyncio.sleep(0.2)

        # uruchomienie sluchania dopiero wtedy, gdy kamera jest gotowa
        user_speech = await asyncio.to_thread(listen_for_command)

        print(f"uzytkownik powiedzial: {user_speech}")

        if "star" in user_speech:
            await speak(correct_camera_set_text)
            break
        elif user_speech == "":
            pass
        else:
            await speak(misunderstood_text)

        # krotka pauza petli
        await asyncio.sleep(0.1)

if __name__ == "__main__":
    asyncio.run(main())