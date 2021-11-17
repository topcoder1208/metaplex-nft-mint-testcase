import os from 'os';
import { writeFile } from 'fs/promises';
import { createCanvas, loadImage } from 'canvas';
import imagemin from 'imagemin';
import imageminPngquant from 'imagemin-pngquant';
import log from 'loglevel';

import { readJsonFile } from '../helpers/various';
import { ASSETS_DIRECTORY, TRAITS_DIRECTORY } from '../helpers/metadata';

function makeCreateImageWithCanvas(order, width, height) {
  return function makeCreateImage(canvas, context) {
    return async function createImage(image) {
      const start = Date.now();
      const ID = parseInt(image.id, 10) - 1;
      await Promise.all(
        order.map(async cur => {
          const imageLocation = `${TRAITS_DIRECTORY}/${cur}/${image[cur]}`;
          const loadedImage = await loadImage(imageLocation);
          context.patternQuality = 'best';
          context.quality = 'best';
          context.drawImage(loadedImage, 0, 0, width, height);
        }),
      );
      const buffer = canvas.toBuffer('image/png');
      context.clearRect(0, 0, width, height);
      const optimizedImage = await imagemin.buffer(buffer, {
        plugins: [
          imageminPngquant({
            quality: [0.6, 0.95],
          }),
        ],
      });
      await writeFile(`${ASSETS_DIRECTORY}/${ID}.png`, optimizedImage);
      const end = Date.now();
      log.info(`Placed ${ID}.png into ${ASSETS_DIRECTORY}.`);
      const duration = end - start;
      log.info('Image generated in:', `${duration}ms.`);
    };
  };
}

function makeCreateImageBufferWithCanvas(order, width, height) {
  return function makeCreateImage(canvas, context) {
    return async function createImage(image, files) {
      const start = Date.now();
      const ID = parseInt(image.id, 10) - 1;
      await Promise.all(
        order.map(async cur => {
          const imageSrc = files[cur][image[cur]];
          const loadedImage = await loadImage(imageSrc);
          context.patternQuality = 'best';
          context.quality = 'best';
          context.drawImage(loadedImage, 0, 0, width, height);
        }),
      );
      const buffer = canvas.toBuffer('image/png');
      context.clearRect(0, 0, width, height);
      const optimizedImage = await imagemin.buffer(buffer, {
        plugins: [
          imageminPngquant({
            quality: [0.6, 0.95],
          }),
        ],
      });
      
      return {
        imageBuffer: optimizedImage,
        imageName: ID + '.png',
        imageId: ID
      };
    };
  };
}

const CONCURRENT_WORKERS = os.cpus().length;

const worker = (work, next_) => async () => {
  let next;
  while ((next = next_())) {
    await work(next);
  }
};

export async function createGenerativeArt(
  configLocation: string,
  randomizedSets,
) {
  const start = Date.now();
  const { order, width, height } = await readJsonFile(configLocation);
  const makeCreateImage = makeCreateImageWithCanvas(order, width, height);

  const imagesNb = randomizedSets.length;

  const workers = [];
  const workerNb = Math.min(CONCURRENT_WORKERS, imagesNb);
  log.info(
    `Instanciating ${workerNb} workers to generate ${imagesNb} images.`,
  );
  for (let i = 0; i < workerNb; i++) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    const work = makeCreateImage(canvas, context);
    const w = worker(work, randomizedSets.pop.bind(randomizedSets));
    workers.push(w());
  }

  await Promise.all(workers);
  const end = Date.now();
  const duration = end - start;
  log.info(
    `Generated ${imagesNb} images in`,
    `${duration / 1000}s.`,
  );
}

export async function createGenerativeArtObjects(
  config: any,
  randomizedSets,
  files
) {
  const start = Date.now();
  const { order, width, height } = config;
  const makeCreateImage = makeCreateImageBufferWithCanvas(order, width, height);

  const imagesNb = randomizedSets.length;

  const workers = {};
  const workerNb = imagesNb;
  
  for (let i = 0; i < workerNb; i++) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    const work = makeCreateImage(canvas, context);
    const randomizedSet = randomizedSets.pop();
    const w = await work(randomizedSet, files);
    workers[w.imageName] = w.imageBuffer;
  }

  return workers;
}
