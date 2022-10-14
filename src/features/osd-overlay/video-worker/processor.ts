import MP4Box from "mp4box";
import VideoWorkerShared from "./shared";
import { StreamDataView } from "stream-data-view";

function avcCBoxToDescription(avcCBox: any): ArrayBuffer {
  const stream = new StreamDataView(undefined, true);

  stream.setNextUint8(avcCBox.configurationVersion);
  stream.setNextUint8(avcCBox.AVCProfileIndication);
  stream.setNextUint8(avcCBox.profile_compatibility);
  stream.setNextUint8(avcCBox.AVCLevelIndication);
  stream.setNextUint8(avcCBox.lengthSizeMinusOne + (63 << 2));

  stream.setNextUint8(avcCBox.nb_SPS_nalus + (7 << 5));
  for (let i = 0; i < avcCBox.SPS.length; i++) {
    stream.setNextUint16(avcCBox.SPS[i].length);
    for (let j = 0; j < avcCBox.SPS[i].length; j++) {
      stream.setNextUint8(avcCBox.SPS[i].nalu[j]);
    }
  }

  stream.setNextUint8(avcCBox.nb_PPS_nalus);
  for (let i = 0; i < avcCBox.PPS.length; i++) {
    stream.setNextUint16(avcCBox.PPS[i].length);
    for (let j = 0; j < avcCBox.PPS[i].length; j++) {
      stream.setNextUint8(avcCBox.PPS[i].nalu[j]);
    }
  }

  if (avcCBox.ext) {
    for (let i = 0; i < avcCBox.ext.length; i++) {
      stream.setNextUint8(avcCBox.ext[i]);
    }
  }

  return stream.getBuffer();
}

type InfoReadyCallback = (info: MP4Box.ISOFileInfo) => void;
type ModifyFrameCallback = (frame: VideoFrame, index: number) => VideoFrame;
type ProgressInitCallback = (total: number) => void;
type ProgressCallback = (processed?: number, preview?: ImageBitmap) => void;

export interface ProcessorOptions {
  infoReady: InfoReadyCallback;
  modifyFrame: ModifyFrameCallback;
  progressInit: ProgressInitCallback;
  progressUpdate: ProgressCallback;
}

export class Processor {
  decoder?: VideoDecoder;
  encoder?: VideoEncoder;

  inFile?: MP4Box.ISOFile;
  inInfo?: MP4Box.ISOFileInfo;
  outFile?: MP4Box.ISOFile;

  expectedFrames: number = 0;
  currentDecodingFrame: number = 0;
  currentEncodingFrame: number = 0;
  outTrackId?: number;

  infoReady: InfoReadyCallback;
  modifyFrame: ModifyFrameCallback;
  progressInit: ProgressInitCallback;
  progressUpdate: ProgressCallback;

  samples: MP4Box.VideoSample[] = [];

  constructor(options: ProcessorOptions) {
    this.infoReady = options.infoReady;
    this.modifyFrame = options.modifyFrame;
    this.progressInit = options.progressInit;
    this.progressUpdate = options.progressUpdate;
  }

  reset() {
    this.inFile = MP4Box.createFile();
    this.inFile.onReady = this.onInInfoReady.bind(this);
    this.inFile.onSamples = this.onInSamples.bind(this);

    this.outFile = MP4Box.createFile();

    if (this.encoder) {
      this.encoder.close();
    }

    this.encoder = new VideoEncoder({
      output: this.handleEncodedFrame.bind(this),
      error: this.handleEncoderError.bind(this),
    });

    if (this.decoder) {
      this.decoder.close();
    }

    this.decoder = new VideoDecoder({
      output: this.handleDecodedFrame.bind(this),
      error: this.handleDecoderError.bind(this),
    });

    this.samples = [];
  }

  async processFile(file: File) {
    this.reset();

    this.currentDecodingFrame = 0;
    this.currentEncodingFrame = 0;
    this.expectedFrames = 0;
    this.outTrackId = undefined;

    const stream = file.stream();
    const reader = stream.getReader();

    let bytesRead = 0;
    while (true) { // eslint-disable-line no-constant-condition
      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      const buffer = value.buffer;
      (buffer as any).fileStart = bytesRead;
      this.inFile!.appendBuffer(buffer);
      bytesRead += value.byteLength;
    }
  }

  processSamples(options: { width: number; height: number }) {
    if (!this.inInfo) {
      throw new Error("No info?");
    }

    this.encoder!.configure({
      codec: "avc1.42003d",
      width: options.width,
      height: options.height,
      bitrate: this.inInfo.videoTracks[0].bitrate,
      framerate: 60,
    });

    this.expectedFrames = this.inInfo.videoTracks[0].nb_samples;
    this.currentEncodingFrame = 0;

    this.progressInit(this.expectedFrames);

    this.inFile!.setExtractionOptions(this.inInfo.videoTracks[0].id, { nbSamples: this.expectedFrames });
    this.inFile!.start();
    this.inFile!.flush();
  }

  onInInfoReady(info: MP4Box.ISOFileInfo) {
    this.inInfo = info;

    this.decoder!.configure({
      codec: info.videoTracks[0].codec,
      codedWidth: info.videoTracks[0].track_width,
      codedHeight: info.videoTracks[0].track_height,
      description: avcCBoxToDescription(
        (this.inFile as any).moov.traks[0].mdia.minf.stbl.stsd.entries[0].avcC
      ),
    });

    this.infoReady(info);
  }

  onInSamples(trackId: unknown, user: unknown, samples: MP4Box.VideoSample[]) {
    for (const sample of samples) {
      this.samples.push(sample);
    }

    if (this.samples.length === this.expectedFrames) {
      this.decodeNextSample();
    }
  }

  decodeNextSample() {
    if (this.currentDecodingFrame >= this.expectedFrames) {
      return;
    }

    const sample = this.samples.shift();
    if (!sample) {
      return;
    }

    const chunk = new EncodedVideoChunk({
      data: sample.data,
      duration: Math.floor((sample.duration / sample.timescale) * 1_000_000),
      timestamp: Math.floor((sample.dts / sample.timescale) * 1_000_000),
      type: sample.is_sync ? "key" : "delta",
    });

    this.decoder!.decode(chunk);
  }


  handleDecodedFrame(frame: VideoFrame) {
    const modifiedFrame = this.modifyFrame!(frame, this.currentDecodingFrame);
    frame.close();

    this.encoder!.encode(modifiedFrame, { keyFrame: this.currentDecodingFrame % 60 === 0 });

    if (this.currentDecodingFrame % 60 === 0) {
      createImageBitmap(modifiedFrame).then((previewBitmap) => {
        this.progressUpdate(undefined, previewBitmap);
      });
    }

    this.currentDecodingFrame++;

    modifiedFrame.close();
  }

  handleDecoderError(e: Error) {
    throw e;
  }

  handleEncodedFrame(
    chunk: EncodedVideoChunk,
    metadata: EncodedVideoChunkMetadata
  ) {
    if (!this.outTrackId) {
      this.outTrackId = this.outFile!.addTrack({
        avcDecoderConfigRecord: metadata.decoderConfig?.description,
        height: this.inInfo!.videoTracks[0].track_height,
        nb_samples: this.inInfo!.videoTracks[0].nb_samples,
        timescale: this.inInfo!.videoTracks[0].timescale,
        width: this.inInfo!.videoTracks[0].track_width,
      });
    }

    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    this.outFile!.addSample(this.outTrackId, buffer, {
      cts: this.currentEncodingFrame,
      dts: this.currentEncodingFrame,
      duration: 1,
      is_sync: chunk.type === "key",
    });

    this.progressUpdate(this.currentEncodingFrame);

    this.currentEncodingFrame++;

    if (this.currentEncodingFrame === this.expectedFrames) {
      const buffer = this.outFile!.getBuffer();

      postMessage({
        type: VideoWorkerShared.MessageType.FILE_OUT,
        buffer,
      } as VideoWorkerShared.FileOutMessage, [buffer]);
    } else {
      this.decodeNextSample();
    }
  }

  handleEncoderError(e: Error) {
    console.error(e);
  }
}
