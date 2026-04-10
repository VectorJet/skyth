from typing import Any, Dict, Optional, List
from backend.base_classes.baseapp import BaseApp

class SpotifyApp(BaseApp):
    """
    The Spotify App integration.
    Allows searching tracks, managing playlists, and controlling playback.
    """
    
    # Since tools are global in 'backend/tools', the App class acts mainly as a
    # metadata holder and potentially a place for app-specific logic if we expand BaseApp.
    # The 'BaseApp' automatically loads the manifest.
    
    pass
