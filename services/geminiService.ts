import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { FormState, GeneratedProductInfo, GeneratedImage, ImageFile } from '../types';

// Ambil API Key dari window object yang di-set oleh config.js
const apiKey = (window as any).GEMINI_API_KEY;

if (!apiKey) {
  alert("API Key Gemini tidak ditemukan. Pastikan Anda sudah membuat file config.js dan memasukkan API key Anda.");
  throw new Error("API_KEY not found in window.GEMINI_API_KEY");
}

const ai = new GoogleGenAI({ apiKey: apiKey });

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

export const generateStoryImages = async (formState: FormState): Promise<GeneratedImage[]> => {
    const parts: any[] = [];
    
    if (formState.productImage) {
        parts.push({
            inlineData: {
                mimeType: formState.productImage.mimeType,
                data: formState.productImage.base64,
            },
        });
    }

    if (formState.characterInputMode === 'upload' && formState.characterImage) {
        parts.push({
            inlineData: {
                mimeType: formState.characterImage.mimeType,
                data: formState.characterImage.base64,
            },
        });
    }

    let textPrompt = `Tugas: Buat gambar fotorealistik baru untuk sebuah iklan.

**Instruksi:**
1.  **Komposisi Adegan**: Gabungkan elemen dari gambar yang disediakan ke dalam adegan baru yang koheren.
2.  **Produk**: ${formState.productImage ? 'Gambar pertama adalah produk' : 'Produknya adalah'} "${formState.productName}". Tempatkan produk secara alami dalam adegan.
3.  **Karakter**: ${
        formState.characterInputMode === 'upload' && formState.characterImage
        ? 'Gambar kedua adalah karakter referensi. Pertahankan kemiripan yang sama persis (wajah, rambut, dll). Karakter harus berinteraksi dengan produk.'
        : formState.characterDescription.trim() !== ''
        ? `Buat karakter yang dideskripsikan sebagai: ${formState.characterGender}, etnis ${formState.characterEthnicity}, "${formState.characterDescription}". Karakter harus berinteraksi dengan produk.`
        : `Buat karakter yang cocok untuk target audiens: "${formState.targetAudience}". Karakter harus berinteraksi dengan produk.`
    }
4.  **Adegan**: Latar tempatnya adalah "${formState.location}".
5.  **Gaya**: Gaya visualnya adalah "${formState.template.split(' ')[0]}" dengan suasana yang sesuai dengan "${formState.videoStyle}".
6.  **Pencahayaan**: Gunakan pencahayaan profesional untuk menonjolkan produk.
7.  **Aspek Rasio**: Gambar akhir harus memiliki aspek rasio ${formState.aspectRatio}.`;
    
    parts.push({ text: textPrompt });

    // Generate 3 images in parallel
    const imagePromises = Array(3).fill(0).map(() => 
        ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        })
    );

    const responses = await Promise.all(imagePromises);

    const generatedImages: GeneratedImage[] = [];
    responses.forEach((response, index) => {
        const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (imagePart && imagePart.inlineData) {
            const base64 = imagePart.inlineData.data;
            const mimeType = imagePart.inlineData.mimeType;
            generatedImages.push({
                id: `img-${index}-${Date.now()}`,
                url: `data:${mimeType};base64,${base64}`,
                base64: base64,
                mimeType: mimeType,
            });
        }
    });
    
    if (generatedImages.length === 0) {
        throw new Error("Model tidak dapat menghasilkan gambar. Coba ubah pengaturan atau gambar input.");
    }

    return generatedImages;
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
    
    // Perlu menambahkan apiKey lagi saat fetch link download
    const operation = await ai.models.generateVideos({
      model: 'veo-2.0-generate-001',
      prompt: prompt,
      image: {
        imageBytes: selectedImage.base64,
        mimeType: selectedImage.mimeType,
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

// Fungsi ini perlu diubah untuk menyertakan API Key
export const fetchVideoWithApiKey = async (downloadLink: string): Promise<Blob> => {
    if (!apiKey) {
        throw new Error("API Key tidak ditemukan untuk mengunduh video.");
    }
    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`Gagal mengunduh video: ${response.statusText}`);
    }
    return await response.blob();
}