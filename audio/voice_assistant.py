import asyncio
import edge_tts
import speech_recognition as sr
import pygame as pg
import os
import uuid

AUDIO_DIR = os.path.dirname(os.path.abspath(__file__))

class VoiceAssistant:
    def __init__(self):
        self.enabled = False
        self.state = "OFF"
        self.mode = None
        self.current_reps = 0
        self.last_spoken_rep = 0
        self.current_errors = []
        self.last_spoken_errors = set()
        self.latest_is_calibrated = False
        
        self.recognizer = sr.Recognizer()
        self.mic = sr.Microphone()
        try:
            with self.mic as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=1)
        except Exception as e:
            print(f"Error initializing microphone: {e}")
            
        self.tts_queue = asyncio.Queue()
        self.speak_task = None
        self.listen_task = None

    def _clear_queue(self):
        while not self.tts_queue.empty():
            try:
                self.tts_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        if pg.mixer.get_init():
            pg.mixer.music.stop()

    async def _speak_loop(self):
        pg.mixer.init()
        while self.enabled:
            try:
                text = await asyncio.wait_for(self.tts_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
                
            if text is None:
                break
                
            communicate = edge_tts.Communicate(text, "pl-PL-MarekNeural")
            temp_file = os.path.join(AUDIO_DIR, f"response_{uuid.uuid4().hex}.mp3")
            try:
                await communicate.save(temp_file)
                pg.mixer.music.load(temp_file)
                pg.mixer.music.play()
                while pg.mixer.music.get_busy() and self.enabled:
                    await asyncio.sleep(0.1)
                pg.mixer.music.unload()
            except Exception as e:
                print(f"Błąd TTS (odtwarzanie): {e}")
            finally:
                try:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                except:
                    pass

    def _listen_once(self):
        with self.mic as source:
            try:
                audio = self.recognizer.listen(source, timeout=1, phrase_time_limit=3)
                text = self.recognizer.recognize_google(audio, language="pl-PL")
                print("Asystent usłyszał:", text)
                return text.lower()
            except sr.WaitTimeoutError:
                return ""
            except sr.UnknownValueError:
                return ""
            except Exception as e:
                return ""

    async def _listen_loop(self):
        licz_words = ["licz", "powtórzenia", "policz"]
        koryguj_words = ["koryg", "popraw", "technika", "korekt", "korygujemy", "koryguj"]
        
        while self.enabled:
            text = await asyncio.to_thread(self._listen_once)
            
            if not self.enabled:
                break
                
            if "koniec" in text:
                print("Asystent wyłączony komendą")
                self.enabled = False
                self.state = "OFF"
                self.mode = None
                break
                
            if any(w in text for w in licz_words) and self.mode != "licz":
                is_switch = self.mode is not None
                self.mode = "licz"
                self.last_spoken_rep = self.current_reps
                self._clear_queue()
                action_text = "Przełączam na" if is_switch else "Włączam"
                if self.latest_is_calibrated:
                    self.state = "ACTIVE"
                    await self.tts_queue.put(f"{action_text} tryb liczenia.")
                else:
                    self.state = "WAITING_FOR_CALIBRATION_AFTER_MODE"
                    await self.tts_queue.put(f"{action_text} tryb liczenia. Skonfiguruj właściwie ustawienie kamery, aby rozpocząć.")
            
            elif any(w in text for w in koryguj_words) and self.mode != "koryguj":
                is_switch = self.mode is not None
                self.mode = "koryguj"
                self.last_spoken_errors.clear()
                self._clear_queue()
                action_text = "Przełączam na" if is_switch else "Włączam"
                if self.latest_is_calibrated:
                    self.state = "ACTIVE"
                    await self.tts_queue.put(f"{action_text} tryb korygowania.")
                else:
                    self.state = "WAITING_FOR_CALIBRATION_AFTER_MODE"
                    await self.tts_queue.put(f"{action_text} tryb korygowania. Skonfiguruj właściwie ustawienie kamery, aby rozpocząć.")
            
            if text:
                print(f"Usłyszano: {text} | Aktualny tryb: {self.mode} | Stan: {self.state}")

    async def enable(self, is_calibrated, reps):
        if self.enabled: return
        self.enabled = True
        self.mode = None
        self.current_reps = reps
        self.last_spoken_rep = reps
        self.last_spoken_errors = set()
        self.latest_is_calibrated = is_calibrated
        
        self._clear_queue()
            
        self.speak_task = asyncio.create_task(self._speak_loop())
        self.listen_task = asyncio.create_task(self._listen_loop())
        
        self.state = "LISTENING_MODE"
        await self.tts_queue.put("Cześć, to twój wirtualny asystent. Na jaki tryb mam się przełączyć? Powiedz licz, lub koryguj.")

    async def disable(self):
        if not self.enabled: return
        self.enabled = False
        self.state = "OFF"
        self.mode = None
        if self.speak_task:
            self.speak_task.cancel()
        if self.listen_task:
            self.listen_task.cancel()

    async def update(self, is_calibrated, reps, errors):
        if not self.enabled:
            return

        self.latest_is_calibrated = is_calibrated
        self.current_reps = reps
        self.current_errors = errors

        if self.state == "WAITING_FOR_CALIBRATION_AFTER_MODE" and is_calibrated:
            self.state = "ACTIVE"
            action_word = "odliczanie" if self.mode == "licz" else "korygowanie"
            await self.tts_queue.put(f"Kamera została poprawnie skonfigurowana. Zaczynam {action_word}.")

        if self.state == "ACTIVE":
            if self.mode == "licz":
                if self.current_reps > self.last_spoken_rep:
                    await self.tts_queue.put(str(self.current_reps))
                    self.last_spoken_rep = self.current_reps
            elif self.mode == "koryguj":
                for err in errors:
                    if err not in self.last_spoken_errors:
                        await self.tts_queue.put(err)
                self.last_spoken_errors = set(errors)