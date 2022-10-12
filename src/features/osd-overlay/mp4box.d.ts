declare module "mp4box" {
  declare namespace MP4Box {
    interface VideoTrack {
      codec: string;
      id: number;
      nb_samples: number;
      timescale: number;
      track_height: number;
      track_width: number;
      bitrate: number;
    }

    interface VideoSample {
      cts: number;
      data: ArrayBuffer;
      dts: number;
      duration: number;
      is_sync: boolean;
      number: number;
      size: number;
      timescale: number;
      timestamp: number;
    }

    class ISOFile {
      sampleProcessingStarted: boolean;

      onError: (error: Error) => void;
      onReady: (info: ISOFileInfo) => void;
      onSamples: (
        trackId: number,
        user: unknown,
        samples: VideoSample[]
      ) => void;

      addSample(
        trackId: number,
        user: unknown,
        options: AddSampleOptions
      ): void;
      addTrack(options: AddTrackOptions): number;
      getBuffer(): ArrayBuffer;
      save(filename: string): void;

      appendBuffer(buffer: ArrayBuffer): number;
      flush(): void;
      start(): void;

      setExtractionOptions(
        trackId: number,
        user?: unknown,
        options?: unknown
      ): void;
    }

    interface AddTrackOptions {
      avcDecoderConfigRecord?: unknown;
      height: number;
      nb_samples: number;
      timescale: number;
      width: number;
    }

    interface AddSampleOptions {
      cts: number;
      dts: number;
      duration: number;
      is_sync: boolean;
    }

    interface ISOFileInfo {
      videoTracks: VideoTrack[];
    }

    function createFile(): ISOFile;
  }

  export default MP4Box;
}
