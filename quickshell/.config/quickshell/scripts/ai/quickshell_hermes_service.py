#!/usr/bin/env /home/razvan/Workspace/ai/tts-read/voice_call/.venv/bin/python
import sys
import os
import json
import subprocess
import signal

# Ensure search paths include tts-read and hermes-agent
TTS_READ_DIR = "/home/razvan/Workspace/ai/tts-read"
VOICE_CALL_DIR = "/home/razvan/Workspace/ai/tts-read/voice_call"
HERMES_DIR = "/home/razvan/.hermes/hermes-agent"

for path in [TTS_READ_DIR, VOICE_CALL_DIR, HERMES_DIR]:
    if path not in sys.path:
        sys.path.insert(0, path)

PID_FILE = "/tmp/quickshell_hermes_voice.pid"

import urllib.request
import yaml

def get_providers_data():
    data = {}
    
    # 1. Local Workstation (Direct)
    try:
        req = urllib.request.Request('http://lx.workstation.lan:11435/v1/models', headers={'User-Agent': 'quickshell'})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            ws_models = json.loads(resp.read().decode())
            models_list = [m['id'] for m in ws_models.get('data', [])]
            data['workstation'] = {
                'id': 'workstation',
                'name': 'Local Workstation',
                'icon': 'computer-symbolic',
                'description': 'Direct connection to local LLM server (lx.workstation.lan:11435)',
                'endpoint': 'http://lx.workstation.lan:11435/v1/chat/completions',
                'api_format': 'openai',
                'requires_key': False,
                'default_model': 'qwen-3.6' if 'qwen-3.6' in models_list else (models_list[0] if models_list else 'default'),
                'models': [
                    {
                        'id': m,
                        'name': m,
                        'model': m,
                        'api_format': 'openai',
                        'endpoint': 'http://lx.workstation.lan:11435/v1/chat/completions',
                        'requires_key': False
                    } for m in models_list
                ]
            }
    except Exception:
        pass

    # 2. Hermes Agent
    try:
        config_path = os.path.expanduser('~/.hermes/config.yaml')
        cfg = {}
        if os.path.exists(config_path):
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}

        def_model = cfg.get('model', {}).get('default', 'default')
        hermes_models = [{
            'id': 'default',
            'name': f'Default ({def_model})',
            'model': 'default',
            'provider': '',
            'base_url': '',
            'api_format': 'hermes',
            'requires_key': False,
            'description': f'Default configured model in Hermes ({def_model})'
        }]

        # Workstation models via Hermes
        for cp in cfg.get('custom_providers', []):
            base_url = cp.get('base_url')
            pname = 'custom:' + cp.get('name', 'custom')
            for mname in cp.get('models', {}).keys():
                hermes_models.append({
                    'id': mname,
                    'name': f'{mname} (Workstation)',
                    'model': mname,
                    'provider': pname,
                    'base_url': base_url,
                    'api_format': 'hermes',
                    'requires_key': False,
                    'description': f'Local workstation {mname} via Hermes Agent'
                })

        # OpenCode Go models via Hermes
        cache_path = os.path.expanduser('~/.hermes/provider_models_cache.json')
        if os.path.exists(cache_path):
            with open(cache_path) as f:
                pcache = json.load(f)
            for mname in pcache.get('opencode-go', {}).get('models', []):
                if mname not in [m['id'] for m in hermes_models]:
                    hermes_models.append({
                        'id': mname,
                        'name': f'{mname} (OpenCode)',
                        'model': mname,
                        'provider': 'opencode-go',
                        'base_url': 'https://opencode.ai/zen/go/v1',
                        'api_format': 'hermes',
                        'requires_key': False,
                        'description': f'{mname} on OpenCode Go via Hermes'
                    })

        data['hermes'] = {
            'id': 'hermes',
            'name': 'Hermes Agent',
            'icon': 'terminal-symbolic',
            'description': 'Hermes autonomous agent with tools, bash, and memory',
            'api_format': 'hermes',
            'requires_key': False,
            'default_model': 'qwen-3.6' if any(m['id'] == 'qwen-3.6' for m in hermes_models) else 'default',
            'models': hermes_models
        }
    except Exception:
        pass

    # 3. Ollama (if running)
    try:
        req = urllib.request.Request('http://localhost:11434/api/tags', headers={'User-Agent': 'quickshell'})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            ollama_data = json.loads(resp.read().decode())
            ollama_models = [m['name'] for m in ollama_data.get('models', [])]
            if ollama_models:
                data['ollama'] = {
                    'id': 'ollama',
                    'name': 'Ollama (Local)',
                    'icon': 'ollama-symbolic',
                    'description': 'Local Ollama instance',
                    'endpoint': 'http://localhost:11434/v1/chat/completions',
                    'api_format': 'openai',
                    'requires_key': False,
                    'default_model': ollama_models[0],
                    'models': [
                        {
                            'id': m.replace(':', '_'),
                            'name': m,
                            'model': m,
                            'api_format': 'openai',
                            'endpoint': 'http://localhost:11434/v1/chat/completions',
                            'requires_key': False
                        } for m in ollama_models
                    ]
                }
    except Exception:
        pass

    return data

def get_profiles_info():
    hermes_dir = os.path.expanduser("~/.hermes")
    active_profile_file = os.path.join(hermes_dir, "active_profile")
    active_profile = "default"
    if os.path.exists(active_profile_file):
        try:
            with open(active_profile_file) as f:
                content = f.read().strip()
                if content:
                    active_profile = content
        except Exception:
            pass

    profiles = []

    # 1. Default profile
    def_model = "default"
    cfg_file = os.path.join(hermes_dir, "config.yaml")
    if os.path.exists(cfg_file):
        try:
            with open(cfg_file) as f:
                c = yaml.safe_load(f) or {}
                def_model = c.get("model", {}).get("default", "default")
        except Exception:
            pass
    profiles.append({
        "name": "default",
        "model": def_model,
        "path": hermes_dir,
        "description": "Default Hermes instance",
        "is_active": (active_profile == "default")
    })

    # 2. Named profiles in ~/.hermes/profiles/
    profiles_dir = os.path.join(hermes_dir, "profiles")
    if os.path.isdir(profiles_dir):
        for entry in sorted(os.listdir(profiles_dir)):
            p_path = os.path.join(profiles_dir, entry)
            if os.path.isdir(p_path) and not entry.startswith("."):
                m_name = "default"
                p_cfg = os.path.join(p_path, "config.yaml")
                if os.path.exists(p_cfg):
                    try:
                        with open(p_cfg) as f:
                            c = yaml.safe_load(f) or {}
                            m_name = c.get("model", {}).get("default", "default")
                    except Exception:
                        pass
                profiles.append({
                    "name": entry,
                    "model": m_name,
                    "path": p_path,
                    "description": f"Hermes profile '{entry}'",
                    "is_active": (active_profile == entry)
                })

    return {
        "active": active_profile,
        "profiles": profiles
    }

def set_profile(name: str):
    info = get_profiles_info()
    valid_names = [p["name"] for p in info["profiles"]]
    if name not in valid_names:
        return {
            "status": "error",
            "message": f"Invalid profile '{name}'. Valid profiles: {', '.join(valid_names)}"
        }

    hermes_dir = os.path.expanduser("~/.hermes")
    active_profile_file = os.path.join(hermes_dir, "active_profile")
    try:
        if name == "default":
            if os.path.exists(active_profile_file):
                os.remove(active_profile_file)
        else:
            with open(active_profile_file, "w") as f:
                f.write(name + "\n")
    except Exception as e:
        return {"status": "error", "message": f"Failed to write active profile: {e}"}

    # Also update voice_call/config.yaml if it exists
    vc_cfg = "/home/razvan/Workspace/ai/tts-read/voice_call/config.yaml"
    if os.path.exists(vc_cfg):
        try:
            with open(vc_cfg, "r") as f:
                vcfg = yaml.safe_load(f) or {}
            if "agent" not in vcfg:
                vcfg["agent"] = {}
            vcfg["agent"]["profile"] = name
            with open(vc_cfg, "w") as f:
                yaml.dump(vcfg, f, default_flow_style=False)
        except Exception:
            pass

    # If voice server is running on 8080, notify it
    try:
        req = urllib.request.Request(
            "http://localhost:8080/api/config",
            data=json.dumps({"agent": {"profile": name}, "persist": True}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=0.5):
            pass
    except Exception:
        pass

    target_model = next((p["model"] for p in info["profiles"] if p["name"] == name), "")
    return {
        "status": "ok",
        "active": name,
        "model": target_model,
        "message": f"Switched Hermes Profile to: {name}"
    }

def run_text_query(prompt: str, model: str = None, provider: str = None, base_url: str = None, profile: str = None):
    try:
        if not profile:
            info = get_profiles_info()
            profile = info.get("active", "default")

        if profile and profile != "default":
            os.environ["HERMES_HOME"] = os.path.expanduser(f"~/.hermes/profiles/{profile}")
        else:
            os.environ.pop("HERMES_HOME", None)

        from run_agent import AIAgent
        kwargs = {"quiet_mode": True}
        if model and model != "default":
            kwargs["model"] = model
            if base_url:
                kwargs["base_url"] = base_url
                kwargs["api_key"] = "sk-notused"
            if provider:
                kwargs["provider"] = provider
        agent = AIAgent(**kwargs)
        response = agent.chat(prompt)
        print(response)
    except Exception as e:
        print(f"Error executing Hermes query: {e}")

def start_voice_call():
    if os.path.exists(PID_FILE):
        print("Voice call already active.")
        return
    cmd = [
        os.path.join(VOICE_CALL_DIR, ".venv/bin/python"),
        os.path.join(VOICE_CALL_DIR, "run_voice_call.py")
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(PID_FILE, "w") as f:
        f.write(str(proc.pid))
    print(f"Voice call started (PID: {proc.pid})")

def stop_voice_call():
    if not os.path.exists(PID_FILE):
        print("No active voice call found.")
        return
    try:
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())
        os.kill(pid, signal.SIGTERM)
        print("Voice call stopped.")
    except Exception as e:
        print(f"Error stopping voice call: {e}")
    finally:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)

def voice_status():
    active = os.path.exists(PID_FILE)
    print(json.dumps({"active": active}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: quickshell_hermes_service.py [text <prompt> | providers | profile [list | set <name>] | voice start | voice stop | voice status]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "text":
        model = None
        provider = None
        base_url = None
        args = sys.argv[2:]
        i = 0
        prompt_parts = []
        while i < len(args):
            if args[i] == "--model" and i + 1 < len(args):
                model = args[i + 1]
                i += 2
            elif args[i] == "--provider" and i + 1 < len(args):
                provider = args[i + 1]
                i += 2
            elif args[i] == "--base-url" and i + 1 < len(args):
                base_url = args[i + 1]
                i += 2
            elif args[i] == "--":
                prompt_parts.extend(args[i + 1:])
                break
            else:
                prompt_parts.append(args[i])
                i += 1
        prompt = " ".join(prompt_parts)
        run_text_query(prompt, model=model, provider=provider, base_url=base_url)
    elif cmd == "providers":
        print(json.dumps(get_providers_data()))
    elif cmd == "profile":
        subcmd = sys.argv[2] if len(sys.argv) > 2 else "list"
        if subcmd in ("get", "list"):
            print(json.dumps(get_profiles_info()))
        elif subcmd == "set":
            pname = sys.argv[3] if len(sys.argv) > 3 else "default"
            print(json.dumps(set_profile(pname)))
        else:
            print(json.dumps(get_profiles_info()))
    elif cmd == "voice":
        subcmd = sys.argv[2] if len(sys.argv) > 2 else "status"
        if subcmd == "start":
            start_voice_call()
        elif subcmd == "stop":
            stop_voice_call()
        else:
            voice_status()
    else:
        print(f"Unknown command: {cmd}")
