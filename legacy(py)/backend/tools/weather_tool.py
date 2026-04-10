import httpx
from typing import Any, Dict
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from backend.base_classes.basetool import BaseTool

class WeatherTool(BaseTool):
    """
    Fetches current weather for a city using the Open-Meteo API (No Key Required).
    """

    @property
    def name(self) -> str:
        return "weather_tool"

    @property
    def description(self) -> str:
        return "Gets the current temperature and conditions for a specific city name."

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "The name of the city (e.g. Paris, Tokyo)."
                }
            },
            "required": ["city"]
        }

    async def run(self, input_data: Any) -> Any:
        # Handle string input or dict input
        city = input_data
        if isinstance(input_data, dict):
            city = input_data.get("city")
            
        if not city:
            return "Error: No city provided."

        try:
            async with httpx.AsyncClient() as client:
                # 1. Geocoding
                geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json"
                geo_res = await client.get(geo_url)
                geo_data = geo_res.json()

                if not geo_data.get("results"):
                    return f"Error: City '{city}' not found."

                location = geo_data["results"][0]
                lat = location["latitude"]
                lon = location["longitude"]
                name = location["name"]
                country = location.get("country", "")

                # 2. Weather
                weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,weather_code&temperature_unit=celsius"
                weather_res = await client.get(weather_url)
                weather_data = weather_res.json()

                current = weather_data.get("current", {})
                temp = current.get("temperature_2m")
                
                return {
                    "location": f"{name}, {country}",
                    "temperature": f"{temp}°C",
                    "coordinates": f"{lat}, {lon}"
                }

        except Exception as e:
            return f"Error fetching weather: {str(e)}"