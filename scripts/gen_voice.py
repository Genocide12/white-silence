#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ГЕНЕРАТОР СТУДИЙНОЙ ОЗВУЧКИ «БЕЛОГО БЕЗМОЛВИЯ» (assets/voice/).

Извлекает ТОЧНЫЕ тексты фраз прямо из кода игры (чтобы манифест
voice_audio.js совпадал буква-в-букву), начитывает их нейроголосами
edge-tts и обрабатывает ffmpeg'ом под каждый канал:

  ded       ru-RU-DmitryNeural   pitch -18Hz, rate -8%  хриплый дед
  radio     ru-RU-DmitryNeural   ламповый приёмник (bandpass 420-2900)
  news      ru-RU-SvetlanaNeural дикторша новостей (bandpass 320-3800)
  cartoon   uk-UA-OstapNeural    писклявая мультяшка (pitch up)
  alien     ru-RU-DmitryNeural   тарелка (эхо + вибрато)
  narrator  ru-RU-DmitryNeural   рассказчик (чистый)

Запуск: python3 scripts/gen_voice.py [--only id1,id2] [--dry]
Выход: assets/voice/<id>.mp3 + assets/voice/manifest.json
"""
import asyncio
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, 'assets', 'voice')
RAW_DIR = '/tmp/voice_raw'

# ---------------------------------------------------------------- каналы
CHANNELS = {
    'ded': {
        'voice': 'ru-RU-DmitryNeural', 'rate': '-8%', 'pitch': '-18Hz',
        'ff': 'volume=1.12,highpass=f=85,lowpass=f=7800',
    },
    'radio': {
        'voice': 'ru-RU-DmitryNeural', 'rate': '-2%', 'pitch': '-5Hz',
        'ff': 'highpass=f=420,lowpass=f=2900,tremolo=f=0.4:d=0.12,volume=1.3',
    },
    'news': {
        'voice': 'ru-RU-SvetlanaNeural', 'rate': '-2%', 'pitch': '+0Hz',
        'ff': 'highpass=f=320,lowpass=f=3800,tremolo=f=0.3:d=0.08,volume=1.25',
    },
    'cartoon': {
        'voice': 'uk-UA-OstapNeural', 'rate': '+8%', 'pitch': '+110Hz',
        'ff': 'asetrate=24000*1.05,aresample=24000,volume=1.05',
    },
    'alien': {
        'voice': 'ru-RU-DmitryNeural', 'rate': '-6%', 'pitch': '+220Hz',
        'ff': 'aecho=0.8:0.7:60|110:0.25|0.2,vibrato=f=5:d=0.25,volume=1.15',
    },
    'narrator': {
        'voice': 'ru-RU-DmitryNeural', 'rate': '-6%', 'pitch': '-8Hz',
        'ff': 'volume=1.0',
    },
}

# ------------------------------------------------------------- извлечение
def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def block_strings(src, start_marker, count=None):
    """Строки массива после маркера: 'a', 'b' + 'c' (конкатенация склеивается)."""
    i = src.index(start_marker)
    depth = 0
    j = src.index('[', i)
    k = j
    while k < len(src):
        if src[k] == '[':
            depth += 1
        elif src[k] == ']':
            depth -= 1
            if depth == 0:
                break
        k += 1
    body = src[j:k + 1]
    # склейка конкатенаций: '...' + '...' → '......'
    body = re.sub(r"'\s*\+\s*'", '', body)
    return re.findall(r"'((?:[^'\\]|\\.)*)'", body)


def extract_bank():
    """Все фразы: [{id, text, ch}]. Тексты — ТОЧНО как в коде."""
    out = []

    # 1) МАТ-БАНК (js/data/mat_phrases.js): категория → фразы, канал ded
    mat = read('js/data/mat_phrases.js')
    for cat in re.findall(r"^\s{6}([a-z_0-9]+):\s*\[", mat, re.M):
        strs = block_strings(mat, cat + ': [')
        for i, s in enumerate(strs):
            out.append(dict(id='mat_%s_%d' % (cat, i + 1), text=s, ch='ded'))

    # 2) РЕПЛИКИ ИЗГНАНИЯ + МУЛЬТЯШКИ (js/systems/crazy.js)
    cz = read('js/systems/crazy.js')
    for i, s in enumerate(block_strings(cz, 'var BANISH_LINES')):
        out.append(dict(id='banish_%d' % (i + 1), text=s, ch='ded'))
    for i, s in enumerate(block_strings(cz, 'var CARTOON_TAUNTS')):
        out.append(dict(id='cartoon_%d' % (i + 1), text=s, ch='cartoon'))

    # 3) ФИКСИРОВАННЫЕ РЕПЛИКИ crazy.js (Voice.say с точным текстом).
    #    ФИКС FV: cz_timeup/cz_joint/cz_respawn убраны — их тексты УЖЕ
    #    озвучены в мат-банке (mat_timeup_1/mat_cz_joint_1/mat_respawn_1),
    #    дубликат текста ломал byText (второй mp3 никогда не звучал).
    #    Добавлена реплика победы onVictory (cz_victory).
    fixed = [
        ('cz_start',    'Так. Где мой вантуз? Пошли спасать мир.'),
        ('cz_d50',      'Время поджимает, дед. Пятьдесят дней прошло.'),
        ('cz_lowhp',    'Ох, чую, лапти свои скоро увижу. Косяк где?'),
        ('cz_victory',  'Летающая тарелка! Я знал! Дед, ты красавчик!'),
    ]
    for pid, s in fixed:
        if ("'" + s + "'") in cz:
            out.append(dict(id=pid, text=s, ch='ded'))

    # 4) ЗОВ ТАРЕЛКИ (js/content/story.js, LINES в doRitualCall)
    st = read('js/content/story.js')
    i = st.index('var LINES = [')
    body = st[st.index('[', i):st.index('];', i) + 1]
    body = re.sub(r"'\s*\+\s*'", '', body)
    for n, s in enumerate(re.findall(r"'((?:[^'\\]|\\.)*)'", body)):
        out.append(dict(id='call%d' % (n + 1), text=s, ch='ded'))

    # 5) РАДИО-ПЕРЕДАЧИ (js/content/radio.js): BR({id, ..., text})
    rd = read('js/content/radio.js')
    RADIO_CH = {'radio': ['r01', 'r02', 'r05', 'r07', 'r11', 'r15'],
                'news': ['r03', 'r04', 'r10']}
    for m in re.finditer(r"BR\(\{(.*?)\}\);", rd, re.S):
        body = m.group(1)
        mid = re.search(r"id:\s*'([^']+)'", body)
        mtext = re.search(r"text:\s*((?:'[^']*'\s*\+\s*)*'[^']*')", body)
        if not mid or not mtext:
            continue
        rid = mid.group(1)
        text = re.sub(r"'\s*\+\s*'", '', mtext.group(1)).strip("'")
        ch = 'news' if rid in RADIO_CH['news'] else 'radio'
        if rid in RADIO_CH['radio'] + RADIO_CH['news'] and '[' not in text:
            out.append(dict(id='radio_' + rid, text=text, ch=ch))

    # 6) СПЕЦ-РЕПЛИКИ (играются по ключу playKey)
    out.append(dict(id='narrator_intro', ch='narrator',
                    text='Пристань-Тихая. Зима тысяча девятьсот семнадцатого года. '
                         'Мороз крепчает, волки голодают, а у телеграфного аппарата — '
                         'один дед. Оттепелей не будет.'))
    out.append(dict(id='alien_heard', ch='alien',
                    text='Дед! Дед! Мы тебя слышим! Держи луч, зелёненький! '
                         'Мы уже летим!'))
    out.append(dict(id='alien_win', ch='alien',
                    text='Пристёгивайся, дед! Полетели к звёздам! Курить разрешено!'))
    return out


# ------------------------------------------------------------- генерация
async def tts_one(phrase, tries=3):
    import edge_tts
    pid, text = phrase['id'], phrase['text']
    ch = CHANNELS[phrase['ch']]
    raw = os.path.join(RAW_DIR, pid + '.wav')
    for attempt in range(tries):
        try:
            comm = edge_tts.Communicate(text, ch['voice'], rate=ch['rate'], pitch=ch['pitch'])
            await comm.save(raw)
            if os.path.getsize(raw) > 4000:
                return raw
        except Exception as e:
            print('  ! %s попытка %d: %s' % (pid, attempt + 1, e))
            await asyncio.sleep(2 + attempt * 3)
    return None


def post_process(phrase, raw):
    pid = phrase['id']
    ch = CHANNELS[phrase['ch']]
    dst = os.path.join(VOICE_DIR, pid + '.mp3')
    cmd = ['ffmpeg', '-y', '-v', 'error', '-i', raw,
           '-af', ch['ff'],
           '-codec:a', 'libmp3lame', '-b:a', '56k', '-ac', '1', '-ar', '24000',
           dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('  ! ffmpeg %s: %s' % (pid, r.stderr.strip()[:200]))
        return None
    return dst


async def main():
    only = None
    dry = '--dry' in sys.argv
    resume = '--resume' in sys.argv or '-r' in sys.argv
    for a in sys.argv[1:]:
        if a.startswith('--only='):
            only = set(a[7:].split(','))
    os.makedirs(VOICE_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)

    bank = extract_bank()
    if only:
        bank = [p for p in bank if p['id'] in only]
    if resume:
        # докачка: пропускаем фразы с готовым mp3 (фоновые процессы песочницы убивает)
        bank = [p for p in bank
                if not os.path.exists(os.path.join(VOICE_DIR, p['id'] + '.mp3'))]
    print('Фраз к озвучке: %d' % len(bank), flush=True)

    manifest = {'phrases': {}}
    # в режиме докачки поднимаем прежний манифест
    if resume and os.path.exists(os.path.join(VOICE_DIR, 'manifest.json')):
        try:
            with open(os.path.join(VOICE_DIR, 'manifest.json'), encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception:
            manifest = {'phrases': {}}
    ok = fail = 0
    for p in bank:
        raw = await tts_one(p)
        if not raw:
            print('  FAIL tts:', p['id'], flush=True)
            fail += 1
            continue
        dst = post_process(p, raw)
        if not dst:
            fail += 1
            continue
        manifest['phrases'][p['id']] = {
            'f': p['id'] + '.mp3', 't': p['text'], 'ch': p['ch']}
        ok += 1
        sz = os.path.getsize(dst) // 1024
        print('  ok %s [%s] %dКБ' % (p['id'], p['ch'], sz), flush=True)
        await asyncio.sleep(0.25)          # вежливость к сервису

    if not dry:
        with open(os.path.join(VOICE_DIR, 'manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('ИТОГ: ok=%d fail=%d, манифест: %d фраз' %
          (ok, fail, len(manifest['phrases'])))
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
