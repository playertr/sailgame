// import viteCompression from 'vite-plugin-compression2';

export default () => {
  return {
    root: 'src',
    base: './',
    build: {
      outDir: '../dist'
    },
    // plugins: [viteCompression({deleteOriginalAssets: true})],
  };
};