### Information about Luma 
Alpha version: (pre 1.0)
- ✅ Play music based on a pre-made set 
- Shuffle playlist with 'weight' on each song, so no songs are played too often
- ✅ Create own stage channel called music if possible (use try, cause maybe it exists!) and start playing.


Full release: (post 1.0)
- Luma AI DJ:
    - Small infos every 15 minutes, where it turns down music volume and then tells time, weather etc.
    - Search content dynamically from youtube, to fit the "house" vibe. (don't safe on device maybe, cause this fucks the hosters upload)
    - Let users go to stage and let them say what music they want (language: EN & DE)

    - Automatically create on VC or Stage without any user interaction



### Requirements
- NodeJS
- ffmpeg
- A music library (selfhosted, or youtube playlist)



### Commands
- !play <- Creates a vc (voice channel) and plays music
- !play-stage <- Creates a stage and plays music
- !stop <- Stops playback and deletes channel

- !list <- Lists all media available
- !skip <- Skips current song