
export interface ImageFile {
  file: File;
  base64: string;
  mimeType: string;
  preview: string;
}

export enum Gender {
  Pria = 'Pria',
  Wanita = 'Wanita',
  TidakDisebutkan = 'Tidak disebutkan',
}

export enum Ethnicity {
  Asia = 'Asia',
  Amerika = 'Amerika',
}

export type CharacterInputMode = 'describe' | 'upload';

export enum AspectRatio {
  Landscape = '16:9',
  Portrait = '9:16',
}

export enum Resolution {
  SD = '720p',
  HD = '1080p',
}

export interface FormState {
  productImage: ImageFile | null;
  productImagePreview: string;
  removeBg: boolean;
  productName: string;
  productDescription: string;
  targetAudience: string;
  characterInputMode: CharacterInputMode;
  characterImage: ImageFile | null;
  characterImagePreview: string;
  characterGender: Gender;
  characterDescription: string;
  characterEthnicity: Ethnicity;
  location: string;
  template: string;
  cta: string;
  videoStyle: string;
  aspectRatio: AspectRatio;
  soundEnabled: boolean;
  resolution: Resolution;
}

export interface GeneratedProductInfo {
  namaProduk: string;
  deskripsiProduk: string;
  targetAudience: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  base64: string;
}

export type VideoGenerationStatus = 'idle' | 'generating' | 'polling' | 'success' | 'error';
