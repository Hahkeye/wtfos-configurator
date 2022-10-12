namespace VideoWorkerShared {
  export const enum MessageType {
    FILE_IN,
    FILE_OUT,
    PROGRESS_INIT,
    PROGRESS_UPDATE,
  }

  export interface FileInMessage {
    type: MessageType.FILE_IN;
    fontFiles: File[];
    osdFile: File;
    videoFile: File;
  }

  export interface FileOutMessage {
    type: MessageType.FILE_OUT;
    blobString: string;
  }

  export interface ProgressInitMessage {
    type: MessageType.PROGRESS_INIT;
    expectedFrames: number;
  }

  export interface ProgressUpdateMessage {
    type: MessageType.PROGRESS_UPDATE;
    currentFrame?: number;
    preview?: ImageBitmap;
  }

  export type Message =
    | FileInMessage
    | FileOutMessage
    | ProgressInitMessage
    | ProgressUpdateMessage;
}

export default VideoWorkerShared;
