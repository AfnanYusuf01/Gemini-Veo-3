
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { FormState, GeneratedProductInfo, GeneratedImage, ImageFile } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateProductInfo = async (imageBase64: string, mimeType: string): Promise<GeneratedProductInfo> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        {
          text: "Analisis gambar produk ini. Berikan nama produk yang menarik, deskripsi singkat (2-3 kalimat), dan target audience yang paling sesuai dalam format JSON. Gunakan Bahasa Indonesia.",
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          namaProduk: { type: Type.STRING },
          deskripsiProduk: { type: Type.STRING },
          targetAudience: { type: Type.STRING },
        },
        required: ["namaProduk", "deskripsiProduk", "targetAudience"],
      },
    },
  });
  
  const text = response.text.trim();
  return JSON.parse(text) as GeneratedProductInfo;
};

export const removeBackground = async (imageBase64: string, mimeType: string): Promise<string | null> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType,
          },
        },
        {
          text: 'remove the background from this image, make the background transparent.',
        },
      ],
    },
    config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return part.inlineData.data;
    }
  }
  return null;
};

const buildImageGenerationPrompt = (formState: FormState): string => {
    let prompt = `Buat gambar fotorealistik berkualitas tinggi untuk iklan video.`;
    
    // Product
    prompt += ` Produk utama adalah "${formState.productName}". Deskripsi: "${formState.productDescription}".`;
    
    // Character
    if (formState.characterInputMode === 'describe' && formState.characterDescription.trim() !== '') {
        prompt += ` Tampilkan seorang model ${formState.characterGender} etnis ${formState.characterEthnicity} yang dideskripsikan sebagai: "${formState.characterDescription}". Model harus berinteraksi secara alami dengan produk.`;
    } else if (formState.characterInputMode === 'upload' && formState.characterImage) {
        prompt += ` Gunakan model atau karakter dari gambar yang diunggah sebagai referensi utama.`;
    } else {
        prompt += ` Tampilkan seseorang yang cocok dengan target audience produk: "${formState.targetAudience}".`;
    }

    // Scene and Style
    prompt += ` Lokasi diatur di ${formState.location}.`;
    prompt += ` Gaya visualnya adalah ${formState.template.split(' ')[0]}, dengan nuansa yang sesuai dengan gaya video "${formState.videoStyle}".`;
    prompt += ` Pencahayaan harus profesional dan menonjolkan produk.`;
    prompt += ` Aspek rasio gambar adalah ${formState.aspectRatio}.`;
    
    return prompt;
};


export const generateStoryImages = async (formState: FormState): Promise<GeneratedImage[]> => {
    const prompt = buildImageGenerationPrompt(formState);
    
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 3,
          outputMimeType: 'image/jpeg',
          aspectRatio: formState.aspectRatio === '16:9' ? '16:9' : '9:16',
        },
    });

    return response.generatedImages.map((img, index) => {
        const base64 = img.image.imageBytes;
        return {
            id: `img-${index}-${Date.now()}`,
            url: `data:image/jpeg;base64,${base64}`,
            base64: base64,
        };
    });
};

const buildVideoGenerationPrompt = (formState: FormState): string => {
    let prompt = `Buat video promosi pendek yang menarik.`;
    prompt += ` Produk: "${formState.productName}".`;
    prompt += ` Video ini harus memiliki gaya ${formState.videoStyle} dan berlokasi di ${formState.location}.`;
    prompt += ` Tampilkan produk dan model dalam adegan yang dinamis.`;
    if (formState.cta.trim() !== '') {
        prompt += ` Akhiri video dengan ajakan bertindak (call to action) yang jelas: "${formState.cta}".`;
    }
    prompt += ` Resolusi video adalah ${formState.resolution}.`;
    if (formState.soundEnabled) {
        prompt += ` Tambahkan musik latar yang sesuai dengan gaya video.`;
    }
    return prompt;
};

export const generateVideo = async (formState: FormState, selectedImage: GeneratedImage) => {
    const prompt = buildVideoGenerationPrompt(formState);
    
    const operation = await ai.models.generateVideos({
      model: 'veo-2.0-generate-001',
      prompt: prompt,
      image: {
        imageBytes: selectedImage.base64,
        mimeType: 'image/jpeg',
      },
      config: {
        numberOfVideos: 1
      }
    });
    return operation;
};

export const pollVideoOperation = async (operation: any) => {
    return await ai.operations.getVideosOperation({ operation: operation });
};
