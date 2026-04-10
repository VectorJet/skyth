#!/usr/bin/env python3
import os
import sys
import yaml
from pathlib import Path

# Add backend to path so we can import converters
sys.path.append(str(Path(__file__).parent))

try:
    from backend.converters.provider import Provider, ModelsDev
except ImportError as e:
    print(f"Error importing provider logic: {e}")
    print("Please make sure you have installed requirements: pip install -r requirements.txt")
    sys.exit(1)

CONFIG_FILE = Path("config.yml")
ENV_FILE = Path(".env")

def load_env():
    current_env = {}
    if ENV_FILE.exists():
        with open(ENV_FILE, "r") as f:
            for line in f:
                if line.strip() and "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    current_env[k] = v
    return current_env

def save_env(new_vars):
    current_env = load_env()
    current_env.update(new_vars)
    
    with open(ENV_FILE, "w") as f:
        for k, v in current_env.items():
            f.write(f"{k}={v}\n")
    print(f"Updated .env with {len(new_vars)} variable(s)")

def load_config():
    if not CONFIG_FILE.exists():
        return {}
    with open(CONFIG_FILE, "r") as f:
        return yaml.safe_load(f) or {}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    print("Updated config.yml")

def select_from_list(items, prompt="Select an item", display_fn=lambda x: x):
    while True:
        for i, item in enumerate(items):
            print(f"{i+1}. {display_fn(item)}")
        
        choice = input(f"\n{prompt} (1-{len(items)}): ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(items):
                return items[idx]
        except ValueError:
            pass
        print("Invalid selection. Please try again.")

def main():
    print("Skyth Provider Setup")
    print("====================")
    
    print("Fetching providers from models.dev...")
    try:
        providers_map = ModelsDev.get()
    except Exception as e:
        print(f"Failed to fetch providers: {e}")
        return

    # Categorize and Sort once
    priority_ids = ["openai", "anthropic", "google", "openrouter", "deepseek", "amazon-bedrock", "azure", "google-vertex", "groq", "ollama"]
    
    popular = []
    others = []
    
    for pid, p in providers_map.items():
        if pid in priority_ids:
            popular.append(p)
        else:
            others.append(p)
            
    popular.sort(key=lambda x: priority_ids.index(x.id) if x.id in priority_ids else 999)
    others.sort(key=lambda x: x.name)
    
    all_providers = popular + others

    while True:
        # 1. Select One Provider
        print("\nSelect a provider to configure:")
        
        # Display list with status
        current_env = load_env()
        for i, p in enumerate(all_providers):
            is_configured = False
            if p.env:
                is_configured = all(os.environ.get(e) or current_env.get(e) for e in p.env)
            status = "[x]" if is_configured else "[ ]"
            print(f"{i+1:3}. {status} {p.name} ({p.id})")

        choice = input(f"\nSelect provider (1-{len(all_providers)}) or 'q' to quit: ").strip().lower()
        if choice == 'q':
            break
            
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(all_providers):
                selected_provider = all_providers[idx]
            else:
                print("Invalid number.")
                continue
        except ValueError:
            print("Please enter a number.")
            continue
        
        print(f"\n--- Configuring {selected_provider.name} ---")

        # 2. Configure Auth (Environment Variables)
        if selected_provider.env:
            updates = {}
            # Reload env to be fresh
            current_env = load_env()
            for env_var in selected_provider.env:
                current_val = os.environ.get(env_var) or current_env.get(env_var)
                prompt_text = f"Enter {env_var}"
                
                if current_val:
                    mask = current_val[:4] + "..." + current_val[-4:] if len(current_val) > 8 else "****"
                    print(f"Current {env_var}: {mask}")
                    if input("Update? [y/N]: ").lower() != 'y':
                        continue
                
                val = input(f"{prompt_text}: ").strip()
                if val:
                    updates[env_var] = val
            
            if updates:
                save_env(updates)
            else:
                print("No environment variables updated.")
        else:
            print("No specific environment variables required for this provider (or handled externally).")

        # 3. Configure Extra Options
        print(f"\n[Optional] Configure extra options for {selected_provider.name} in config.yml?")
        print("Example: set 'api_base' if using a custom endpoint, or 'timeout'.")
        if input("Configure options? [y/N]: ").strip().lower() == 'y':
            config = load_config()
            if "provider" not in config: config["provider"] = {}
            if selected_provider.id not in config["provider"]: config["provider"][selected_provider.id] = {}
            if "options" not in config["provider"][selected_provider.id]: config["provider"][selected_provider.id]["options"] = {}
            
            current_options = config["provider"][selected_provider.id]["options"]
            
            while True:
                print("\nCurrent options:", current_options)
                key = input("Enter option key (or 'q' to finish): ").strip()
                if key == 'q' or not key:
                    break
                value = input(f"Enter value for '{key}': ").strip()
                
                if value.lower() == 'true': value = True
                elif value.lower() == 'false': value = False
                elif value.isdigit(): value = int(value)
                
                current_options[key] = value
                
            save_config(config)

        # 4. Fetch and Select Models (Optional)
        print(f"\nDo you want to set a model from {selected_provider.name} as your DEFAULT model?")
        if input("Set default model? [y/N]: ").strip().lower() == 'y':
            models = selected_provider.models
            if not models:
                print(f"No models found for {selected_provider.name}.")
            else:
                model_list = list(models.keys())
                model_list.sort()
                
                print(f"\nAvailable models for {selected_provider.name}:")
                
                print("\nSelect PRIMARY model (default for most tasks):")
                primary_model_id = select_from_list(model_list)
                
                print("\nSelect SECONDARY/SMALL model (for fast, cheap tasks):")
                secondary_model_id = select_from_list(model_list)

                # Update config.yml
                config = load_config()
                config["model"] = f"{selected_provider.id}/{primary_model_id}"
                config["small_model"] = f"{selected_provider.id}/{secondary_model_id}"
                
                # Ensure provider entry exists
                if "provider" not in config: config["provider"] = {}
                if selected_provider.id not in config["provider"]: config["provider"][selected_provider.id] = {}

                save_config(config)
                print(f"Updated default models to {config['model']} and {config['small_model']}")

        print("\nProvider configuration complete.")
        print("-" * 40)

if __name__ == "__main__":
    main()