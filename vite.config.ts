import viteCompression from 'vite-plugin-compression2';

export default () => {
  return {
    root: 'src',
    base: 'https://playertr.github.io/sailgame/',
    build: {
      outDir: '../dist'
    },
    plugins: [viteCompression({deleteOriginalAssets: true})],
  };
};