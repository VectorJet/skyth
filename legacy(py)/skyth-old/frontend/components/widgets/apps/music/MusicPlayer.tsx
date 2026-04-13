"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  album_art?: string; // base64
  mime_type: string;
}

interface MusicPlayerProps {
  data: {
    songs: Song[];
    audio_data: Record<string, string>; // Map id -> base64 audio
  };
}

export default function MusicPlayer({ data }: MusicPlayerProps) {
  const { songs, audio_data } = data;
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentSong = songs[currentSongIndex];

  // Initialize audio source when song changes
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    
    const audio = audioRef.current;
    const base64Audio = audio_data[currentSong.id];
    
    if (base64Audio) {
      audio.src = `data:${currentSong.mime_type};base64,${base64Audio}`;
      audio.load();
      if (isPlaying) audio.play();
    }

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnd = () => handleNext();

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnd);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnd);
    };
  }, [currentSongIndex]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleNext = () => {
    setCurrentSongIndex((prev) => (prev + 1) % songs.length);
    setIsPlaying(true);
  };

  const handlePrev = () => {
    setCurrentSongIndex((prev) => (prev - 1 + songs.length) % songs.length);
    setIsPlaying(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (val / 100) * audioRef.current.duration;
      setProgress(val);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black text-white p-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Album Art */}
        <div className="w-full md:w-1/3 aspect-square relative rounded-xl overflow-hidden shadow-2xl bg-gray-800 flex items-center justify-center">
          {currentSong.album_art ? (
            <img src={currentSong.album_art} alt="Album Art" className="w-full h-full object-cover" />
          ) : (
            <Music className="w-20 h-20 text-gray-600" />
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col justify-center space-y-6">
          <div>
            <h3 className="text-2xl font-bold line-clamp-1">{currentSong.title}</h3>
            <p className="text-gray-400 text-lg">{currentSong.artist}</p>
            <p className="text-gray-600 text-sm">{currentSong.album}</p>
          </div>

          <div className="space-y-2">
            <input 
              type="range" 
              value={progress} 
              max="100" 
              onChange={handleSeek}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
            />
            <div className="flex justify-between text-xs text-gray-500 font-mono">
              <span>{audioRef.current ? formatTime(audioRef.current.currentTime) : "0:00"}</span>
              <span>{formatTime(currentSong.duration || 0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <Button variant="ghost" size="icon" onClick={handlePrev} className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full h-12 w-12">
              <SkipBack className="w-6 h-6 fill-current" />
            </Button>
            <Button onClick={togglePlay} className="h-16 w-16 rounded-full bg-white text-black hover:bg-gray-200 hover:scale-105 transition-all shadow-lg flex items-center justify-center">
              {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full h-12 w-12">
              <SkipForward className="w-6 h-6 fill-current" />
            </Button>
          </div>
        </div>
      </div>

      {/* Playlist Preview */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Up Next</p>
        <div className="space-y-1 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
          {songs.map((song, i) => (
            <button 
              key={song.id} 
              onClick={() => { setCurrentSongIndex(i); setIsPlaying(true); }}
              className={`w-full flex items-center justify-between p-2 rounded-lg text-sm text-left transition-colors ${i === currentSongIndex ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'}`}
            >
              <span className="truncate">{i + 1}. {song.title}</span>
              <span className="text-xs opacity-50">{formatTime(song.duration)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}