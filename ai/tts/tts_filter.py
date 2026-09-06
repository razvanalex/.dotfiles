"""
tts_filter.py — Configurable text pre-processing and normalization for CosyVoice3.

Loads normalization rules dynamically from normalizer_config.yaml.
Supports wetext (WeTextProcessing) for standard number normalization,
emoji/kaomoji/exotic script stripping, case-insensitive literal mappings, and custom regex rules.
"""

import os
import re
import sys
import unicodedata
import yaml

# ---------------------------------------------------------------------------
# Default Configuration
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "strip_emojis": True,
    "strip_kaomoji": True,
    "strip_non_speech_chars": True,
    "use_wetext": True,
    "regex_rules": {
        "(\\d+)(B|M)(?![a-zA-Z])": "\\1 \\2",
        "=": " equals ",
        "/": " ",
        "_": " ",
        "\\.([a-zA-Z0-9]{2,4})\\b": " dot \\1",
        "[\\#\\$\\^\\*\\(\\)\\[\\]\\{\\}\\<\\>\\~\\`\\|]+": " ",
        "\\s+": " "
    },
    "literal_rules": {
        "ttsfrd": "tts F R D",
        "dmesg": "dee mesg",
        "asus": "Asus",
        "hyprland": "hyper land"
    }
}

# ---------------------------------------------------------------------------
# Emojis, Kaomoji, and Non-Speech Whitelist Regexes
# ---------------------------------------------------------------------------
_EMOJI_RE = re.compile(
    u"["
    u"\U0001F600-\U0001F64F"  # emoticons
    u"\U0001F300-\U0001F5FF"  # symbols & pictographs
    u"\U0001F680-\U0001F6FF"  # transport & map
    u"\U0001F700-\U0001F77F"  # alchemical
    u"\U0001F780-\U0001F7FF"  # geometric extended
    u"\U0001F800-\U0001F8FF"  # supplemental arrows
    u"\U0001F900-\U0001F9FF"  # supplemental symbols
    u"\U0001FA00-\U0001FA6F"  # chess / other
    u"\U0001FA70-\U0001FAFF"  # symbols extended-A
    u"\U00002702-\U000027B0"  # dingbats
    u"\U000024C2-\U0001F251"  # enclosed chars
    u"\U0000200B-\U0000200F"  # zero-width chars
    u"\U0000FE00-\U0000FE0F"  # variation selectors
    u"\U0001F1E0-\U0001F1FF"  # flags
    u"]+", flags=re.UNICODE
)

_BRACKET_RE = re.compile(
    r"[^\w\s]{0,3}[\(\[\{<（]([^)\]\}>）]{1,40})[\)\]\}>）][^\w\s]{0,3}",
    re.UNICODE
)

# Whitelist: match any character that is NOT a standard spoken character or punctuation.
# Includes: English, Western European accents, Chinese, Japanese (Hiragana/Katakana), Korean (Hangul),
# spaces, digits, standard punctuation, and common speakable symbols ($%+*#@/_).
# Any character NOT in this whitelist is stripped when strip_non_speech_chars is enabled.
_NON_SPEECH_RE = re.compile(
    r"[^\sa-zA-Z0-9_.,!?;:\"\'()\-\u00c0-\u00ff\u0100-\u017f\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af，。！？；：、（）“”《》$%+*#@/_]"
)

_LINE_NUMBER_RE = re.compile(r"^(\s*)\d{3}\b\s*")

# Cache for loaded config
_CONFIG = None
_EN_NORMALIZER = None
_ZH_NORMALIZER = None

def get_config():
    global _CONFIG
    if _CONFIG is not None:
        return _CONFIG

    # Search in order:
    # 1. Next to the main script (e.g. Workspace/ai/tts-read/)
    # 2. Next to tts_filter.py (Workspace/ai/)
    # 3. Absolute path fallback
    search_paths = [
        os.path.join(os.path.dirname(__file__), "tts-read", "normalizer_config.yaml"),
        os.path.join(os.path.dirname(__file__), "normalizer_config.yaml"),
        
    ]

    for path in search_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                    if data:
                        merged = DEFAULT_CONFIG.copy()
                        merged.update(data)
                        _CONFIG = merged
                        return _CONFIG
            except Exception as e:
                print(f"Warning: Failed to load text normalizer config from {path}: {e}", file=sys.stderr)

    _CONFIG = DEFAULT_CONFIG
    return _CONFIG

# ---------------------------------------------------------------------------
# WeTextProcessing Lazy Loaders
# ---------------------------------------------------------------------------
def get_wetext_normalizer(lang="en"):
    global _EN_NORMALIZER, _ZH_NORMALIZER
    if lang == "en":
        if _EN_NORMALIZER is None:
            try:
                from tn.english.normalizer import Normalizer
                _EN_NORMALIZER = Normalizer()
            except ImportError:
                pass
        return _EN_NORMALIZER
    elif lang == "zh":
        if _ZH_NORMALIZER is None:
            try:
                from tn.chinese.normalizer import Normalizer
                _ZH_NORMALIZER = Normalizer()
            except ImportError:
                pass
        return _ZH_NORMALIZER
    return None

# ---------------------------------------------------------------------------
# Emoji/Kaomoji Filtering
# ---------------------------------------------------------------------------
def _is_kaomoji(inner: str) -> bool:
    """Return True if bracketed content looks like a kaomoji face."""
    non_space = [c for c in inner if not c.isspace()]
    if not non_space:
        return False
    exotic = sum(
        1 for c in non_space
        if ord(c) > 127 or unicodedata.category(c) in ("Po", "Ps", "Pe", "So", "Sm", "Sk", "Sc")
    )
    return exotic / len(non_space) > 0.4

# ---------------------------------------------------------------------------
# Public API & Emotion Extraction
# ---------------------------------------------------------------------------
ACOUSTIC_TOKENS: set[str] = {
    "laughter", "laugh", "laughing", "cough", "sigh", "breath", "lipsmack", "noise"
}

EMOTION_INSTRUCTIONS: dict[str, str] = {
    "happy": "高兴",
    "sad": "伤心",
    "angry": "生气",
    "excited": "兴奋",
    "surprised": "惊讶",
    "fearful": "恐惧",
    "laughter": "开怀大笑",
    "laughing": "笑",
    "laugh": "笑",
    "whisper": "轻声耳语",
    "curious": "好奇",
    "playful": "调皮",
    "calm": "平静",
    "warm": "温柔",
}


def extract_emotion(text: str) -> tuple[str, str | None, str | None]:
    """Extract emotion directive tag from the beginning of text.

    Returns:
        (clean_text, emotion_name, instruction_chinese)
    """
    m = re.match(r"^\s*\[(?:emotion:\s*)?([a-zA-Z_-]+)\]\s*", text, re.IGNORECASE)
    if m:
        tag = m.group(1).lower()
        if tag in ACOUSTIC_TOKENS:
            return text, None, None
        instruction = EMOTION_INSTRUCTIONS.get(tag, tag)
        clean = text[m.end():]
        return clean, tag, instruction
    return text, None, None


def strip_line_numbers(text: str) -> str:
    """Remove leading 3-digit line numbers from each line."""
    lines = text.split("\n")
    return "\n".join(_LINE_NUMBER_RE.sub(r"\1", line) for line in lines)


def clean_text(text: str) -> str:
    """Apply config-based emoji, kaomoji, and symbol sanitization."""
    cfg = get_config()

    # 1. Unicode emoji stripping
    if cfg.get("strip_emojis", True):
        text = _EMOJI_RE.sub("", text)

    # 2. Kaomoji stripping
    if cfg.get("strip_kaomoji", True):
        text = _BRACKET_RE.sub(lambda m: "" if _is_kaomoji(m.group(1)) else m.group(0), text)
        text = re.sub(r"[\uff00-\uffef]{2,}", "", text)  # left-over fullwidth punctuation

    # 2b. Strip any non-acoustic bracketed tags (e.g. [calm], [thoughtful], [nodding])
    def _strip_non_acoustic(m: re.Match) -> str:
        inner = m.group(1).lower().strip()
        if inner in ACOUSTIC_TOKENS:
            return m.group(0)
        return ""

    text = re.sub(r"\[([a-zA-Z\s_-]+)\]\s*", _strip_non_acoustic, text)

    # 3. Non-speech character stripping (kaomoji residue, non-standard scripts)
    if cfg.get("strip_non_speech_chars", True):
        text = _NON_SPEECH_RE.sub("", text)

    # 4. Collapse multiple spaces
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def clean_markdown(text: str) -> str:
    """Normalize markdown headings, lists, and formatted items into clean spoken sentences."""
    # 1. Clean task list checkboxes
    text = re.sub(r"\[[ xX]\]\s*", "", text)
    
    # 2. Clean markdown headers
    text = re.sub(r"(?m)^\s*#+\s*(.+?)[.!?;:]*$", r"\1. ", text)
    
    # 3. Clean bullet points (e.g. "- Item" -> "Item. ")
    text = re.sub(r"(?m)^\s*[-*+]\s*(.+?)[.!?;:]*$", r"\1. ", text)
    
    # 4. Add period to standalone lines (no trailing punctuation, followed by newline)
    text = re.sub(r"(?m)^([a-zA-Z0-9\s,;'\"()-]+?)$", r"\1. ", text)
    
    # 5. Normalize trailing colons, semicolons, or commas at the end of lines to periods
    text = re.sub(r"(?m)([:;,]+)\s*$", r". ", text)
    
    return text

def preprocess(text: str) -> str:
    """Full preprocessing and normalization pipeline."""
    cfg = get_config()

    # Step 0: Clean markdown formatting
    text = clean_markdown(text)

    # Step 1: Strip line numbers and sanitize non-speakable elements
    text = strip_line_numbers(text)
    text = clean_text(text)

    # Step 2: Apply WeTextProcessing (if enabled and available)
    if cfg.get("use_wetext", True):
        has_chinese = any('\u4e00' <= c <= '\u9fff' for c in text)
        if has_chinese:
            norm_zh = get_wetext_normalizer("zh")
            if norm_zh:
                try:
                    text = norm_zh.normalize(text)
                except Exception as e:
                    print(f"Warning: Chinese wetext normalization failed: {e}", file=sys.stderr)
        else:
            norm_en = get_wetext_normalizer("en")
            if norm_en:
                try:
                    text = norm_en.normalize(text)
                except Exception as e:
                    print(f"Warning: English wetext normalization failed: {e}", file=sys.stderr)

    # Step 3: Literal Word replacements (Case-insensitive)
    literal_rules = cfg.get("literal_rules", {})
    if literal_rules:
        for word, replacement in literal_rules.items():
            pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
            text = pattern.sub(replacement, text)

    # Step 4: Custom regex replacements
    regex_rules = cfg.get("regex_rules", {})
    if regex_rules:
        for pattern_str, replacement in regex_rules.items():
            try:
                pattern = re.compile(pattern_str, re.UNICODE)
                text = pattern.sub(replacement, text)
            except Exception as e:
                print(f"Warning: Regex rule '{pattern_str}' failed: {e}", file=sys.stderr)

    # Final space consolidation
    text = re.sub(r"\s+", " ", text).strip()

    # Step 5: Ensure terminal punctuation so CosyVoice model generates clean EOS silence
    if text and text[-1] not in ".!?;:。！？；：":
        text += "."

    return text
