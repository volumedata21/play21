import { VideoFile, FolderStructure } from '../types';

export const getMockData = (): { videos: VideoFile[], structure: FolderStructure } => {
  const mockVideos: VideoFile[] = [
    {
      id: 'mock-1',
      name: 'Big Buck Bunny',
      path: 'Animations/Big Buck Bunny.mp4',
      folder: 'Animations',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg',
      duration: 596,
      durationStr: '9:56',
      views: '12.5M views',
      viewsCount: 12500000,
      timeAgo: '2 years ago',
      createdAt: Date.now() - 63072000000,
      description: 'Big Buck Bunny tells the story of a giant rabbit with a heart bigger than himself. When one sunny day three rodents rudely harass him, something snaps... and the bunny decides to get even.'
    },
    {
      id: 'mock-2',
      name: 'Elephant Dream',
      path: 'Animations/Elephant Dream.mp4',
      folder: 'Animations',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Elephants_Dream_poster.jpg/800px-Elephants_Dream_poster.jpg',
      duration: 653,
      durationStr: '10:53',
      views: '8.1M views',
      viewsCount: 8100000,
      timeAgo: '5 years ago',
      createdAt: Date.now() - 157680000000,
      description: 'The world\'s first open movie, made entirely with open source graphics software such as Blender. It tells the story of two characters, Emo and Proog, navigating a surreal and infinite machine.'
    },
    {
      id: 'mock-3',
      name: 'For Bigger Blazes',
      path: 'Action/For Bigger Blazes.mp4',
      folder: 'Action',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail: 'https://i.ytimg.com/vi/Dr9C2oswZfA/maxresdefault.jpg', // Placeholder
      duration: 15,
      durationStr: '0:15',
      views: '450K views',
      viewsCount: 450000,
      timeAgo: '3 months ago',
      createdAt: Date.now() - 7776000000,
      description: 'High octane action sequences compiled for high definition display testing. Experience the blaze like never before.'
    },
    {
      id: 'mock-4',
      name: 'For Bigger Escapes',
      path: 'Action/For Bigger Escapes.mp4',
      folder: 'Action',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnail: 'https://img.youtube.com/vi/WeG6kL7t400/maxresdefault.jpg', // Placeholder
      duration: 15,
      durationStr: '0:15',
      views: '230K views',
      viewsCount: 230000,
      timeAgo: '1 month ago',
      createdAt: Date.now() - 2592000000,
      description: 'A cinematic escape sequence designed to test screen contrast and motion handling.'
    },
    {
      id: 'mock-5',
      name: 'Tears of Steel',
      path: 'Sci-Fi/Tears of Steel.mp4',
      folder: 'Sci-Fi',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Tears_of_Steel_poster.jpg/800px-Tears_of_Steel_poster.jpg',
      duration: 734,
      durationStr: '12:14',
      views: '15M views',
      viewsCount: 15000000,
      timeAgo: '8 years ago',
      createdAt: Date.now() - 252288000000,
      description: 'In a dystopian future, a group of warriors and scientists gather at the Oude Kerk in Amsterdam to stage a desperate experiment to save the world from destructive robots.'
    },
    {
      id: 'mock-6',
      name: 'Sintel',
      path: 'Animations/Sintel.mp4',
      folder: 'Animations',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Sintel_poster.jpg/800px-Sintel_poster.jpg',
      duration: 888,
      durationStr: '14:48',
      views: '22M views',
      viewsCount: 22000000,
      timeAgo: '11 years ago',
      createdAt: Date.now() - 346896000000,
      description: 'The film follows a girl named Sintel who is searching for a baby dragon she calls Scales. A searching quest that takes her from her hometown to the ends of the earth.'
    },
    {
      id: 'mock-7',
      name: 'Subaru Outback On Street And Dirt',
      path: 'Cars/Subaru Outback.mp4',
      folder: 'Cars',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
      duration: 594,
      durationStr: '9:54',
      views: '56K views',
      viewsCount: 56000,
      timeAgo: '2 weeks ago',
      createdAt: Date.now() - 1209600000,
      description: 'A comprehensive review of the Subaru Outback, testing its capabilities both on city streets and rugged dirt trails.'
    },
    {
      id: 'mock-8',
      name: 'Volkswagen GTI Review',
      path: 'Cars/Volkswagen GTI.mp4',
      folder: 'Cars',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
      duration: 594,
      durationStr: '9:54',
      views: '120K views',
      viewsCount: 120000,
      timeAgo: '5 days ago',
      createdAt: Date.now() - 432000000,
      description: 'Is the new GTI the ultimate hot hatch? We take it for a spin to find out if it lives up to the legacy.'
    }
  ];

  const structure: FolderStructure = {};
  
  mockVideos.forEach(video => {
    if (!structure[video.folder]) {
      structure[video.folder] = [];
    }
    structure[video.folder].push(video);
  });

  return { videos: mockVideos, structure };
};
