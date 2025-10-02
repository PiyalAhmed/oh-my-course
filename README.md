# Oh My Course! 🎓

A beautiful, offline-first course viewer for your downloaded video courses. Built with vanilla JavaScript, featuring a sleek Spotify-inspired design.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

- 📚 **Course Library** - Manage multiple courses in one place
- 🎥 **Video Playback** - Native HTML5 video player with subtitle support
- 📊 **Progress Tracking** - Track completion status for each lesson
- ⏯️ **Resume Support** - Automatically resume videos from where you left off
- 🔒 **100% Offline** - Everything stays on your device, nothing is uploaded
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile
- 🎨 **Modern UI** - Clean, Spotify-inspired interface
- 🚀 **No Installation** - Just open in your browser

## 🚀 Quick Start

1. Clone this repository:
```bash
git clone https://github.com/yourusername/oh-my-course.git
cd oh-my-course
```

2. Open `index.html` in a modern web browser (Chrome, Edge, or Safari recommended)

3. Click "Add Course" and select your course folder

That's it! No build steps, no dependencies to install.

## 📁 Course Structure

Your course folder should be organized like this:

```
Course Name/
├── 1. Introduction/
│   ├── 1. Welcome.mp4
│   ├── 1. Welcome.vtt (optional subtitles)
│   ├── 2. Getting Started.mp4
│   └── resources.pdf
├── 2. Advanced Topics/
│   ├── 1. Deep Dive.mp4
│   ├── 2. Practice.mp4
│   └── slides.pdf
└── 3. Conclusion/
    └── 1. Final Thoughts.mp4
```

**Requirements:**
- Sections should be folders with numbered prefixes (e.g., `1. Section Name`)
- Video files should be numbered (e.g., `1. Lesson Name.mp4`)
- Supported video format: MP4
- Optional: Add `.vtt` subtitle files matching video names
- Other file types (PDF, etc.) can be present but are accessed via the local folder

## 🌟 Usage

### Adding a Course
1. Click "Add Course" on the homepage
2. Select your course folder
3. The course will be added to your library

### Opening a Course
- Click "Open Course" in the header to directly open a course folder
- Or click any course card in your library

### Watching Videos
- Click any lesson in the sidebar to start watching
- Mark lessons as complete using the checkbox or "Mark Complete" button
- Use Previous/Next buttons to navigate between lessons
- Videos automatically resume from where you left off

### Managing Your Library
- View all your courses on the homepage
- See progress percentage for each course
- Delete courses from your library with the DELETE button

## 🔧 Browser Compatibility

This app uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which requires:

- ✅ Chrome 86+
- ✅ Edge 86+
- ✅ Safari 15.2+ (limited support)
- ❌ Firefox (not supported)

## 🛠️ Technology Stack

- **HTML5** - Structure
- **CSS3** - Styling with custom properties
- **Vanilla JavaScript** - No frameworks
- **IndexedDB** - Persistent directory handle storage
- **LocalStorage** - Progress and session tracking
- **PDF.js** - PDF viewing (future feature)
- **File System Access API** - Local folder access

## 🎨 Design

The UI is inspired by Spotify's clean, modern design with:
- Dark theme optimized for video watching
- Smooth animations and transitions
- Responsive layout for all screen sizes
- Accessible color palette

## 🤝 Contributing

Contributions are welcome! Here are some ways you can help:

- 🐛 Report bugs
- 💡 Suggest new features
- 🔧 Submit pull requests
- 📖 Improve documentation
- 🌍 Add translations

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## ☕ Support

If you find this project helpful, consider [buying me a coffee](https://buymeacoffee.com/piyalahmed)!

## 🐛 Known Issues

- File System Access API has limited browser support
- Directory handles may need re-permission after browser restart (browser-dependent)
- Non-video files (PDFs, documents) must be accessed via local folder

## 🔮 Roadmap

- [ ] In-app PDF viewer
- [ ] Note-taking feature
- [ ] Playback speed control
- [ ] Keyboard shortcuts
- [ ] Dark/Light theme toggle
- [ ] Export/Import course progress
- [ ] Search functionality
- [ ] Custom course thumbnails

## 📧 Contact

Created by [@piyalahmed](https://buymeacoffee.com/piyalahmed)

---

**Your courses, our UI** ✨
