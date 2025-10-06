import React, { useState, useCallback, useMemo } from 'react';
import type { 
  FormState,
  GeneratedProductInfo,
  GeneratedImage,
  VideoGenerationStatus,
  CharacterInputMode
} from './types';
import { 
  AspectRatio,
  Ethnicity,
  Gender,
  Resolution
} from './types';
import { 
  LOCATIONS,
  TEMPLATES,
  VIDEO_STYLES,
  LOADING_MESSAGES
} from './constants';
import {
  generateProductInfo,
  removeBackground,
  generateStoryImages,
  generateVideo,
  pollVideoOperation,
  fetchVideoWithApiKey
} from './services/geminiService';

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = result.split(';')[0].split(':')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = (error) => reject(error);
  });
};


const App: React.FC = () => {
  const [formState, setFormState] = useState<FormState>({
    productImage: null,
    productImagePreview: '',
    removeBg: true,
    productName: '',
    productDescription: '',
    targetAudience: '',
    characterInputMode: 'describe',
    characterImage: null,
    characterImagePreview: '',
    characterGender: Gender.TidakDisebutkan,
    characterDescription: '',
    characterEthnicity: Ethnicity.Asia,
    location: LOCATIONS[0],
    template: TEMPLATES[0],
    cta: 'Beli Sekarang!',
    videoStyle: VIDEO_STYLES[0],
    aspectRatio: AspectRatio.Portrait,
    soundEnabled: true,
    resolution: Resolution.HD,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormState(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormState(prev => ({ ...prev, [name]: value }));
    }
  }, []);
  
  const handleProductImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const { base64, mimeType } = await fileToBase64(file);
      const originalImage = { file, base64, mimeType, preview: URL.createObjectURL(file) };
      setFormState(prev => ({ ...prev, productImage: originalImage, productImagePreview: originalImage.preview }));
      
      setIsLoading(true);
      setError(null);
      setLoadingStep('Menganalisis produk...');

      try {
        let imageForProcessing = originalImage;
        if (formState.removeBg) {
            setLoadingStep('Menghapus background...');
            const removedBgData = await removeBackground(originalImage.base64, originalImage.mimeType);
            if(removedBgData) {
              const preview = `data:image/png;base64,${removedBgData}`;
              const processedImage = { file, base64: removedBgData, mimeType: 'image/png', preview };
              imageForProcessing = processedImage;
              setFormState(prev => ({ ...prev, productImage: processedImage, productImagePreview: preview }));
            }
        }

        setLoadingStep('Membuat deskripsi produk...');
        const productInfo: GeneratedProductInfo = await generateProductInfo(imageForProcessing.base64, imageForProcessing.mimeType);
        setFormState(prev => ({
          ...prev,
          productName: productInfo.namaProduk || '',
          productDescription: productInfo.deskripsiProduk || '',
          targetAudience: productInfo.targetAudience || '',
        }));

      } catch (err) {
        console.error(err);
        setError('Gagal memproses gambar produk. Coba lagi.');
      } finally {
        setIsLoading(false);
        setLoadingStep('');
      }
    }
  }, [formState.removeBg]);

  const handleCharacterImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const { base64, mimeType } = await fileToBase64(file);
        const charImage = { file, base64, mimeType, preview: URL.createObjectURL(file) };
        setFormState(prev => ({ ...prev, characterImage: charImage, characterImagePreview: charImage.preview }));
      }
  }, []);
  
  const handleGenerateImages = async () => {
    if (!formState.productImage) {
      setError('Silakan unggah gambar produk terlebih dahulu.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setLoadingStep('Membuat variasi gambar...');
    setGeneratedImages([]);
    setSelectedImage(null);
    setVideoUrl(null);
    
    try {
      const images = await generateStoryImages(formState);
      setGeneratedImages(images);
      if (images.length > 0) {
        setSelectedImage(images[0]); // Automatically select the first image
      }
    } catch (err) {
      console.error(err);
      setError('Gagal membuat gambar. Coba lagi dengan prompt yang berbeda.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const loadingMessage = useMemo(() => {
    if (!isLoading || loadingStep !== 'Membuat video...') return null;
    const index = Math.floor(Date.now() / 5000) % LOADING_MESSAGES.length;
    return LOADING_MESSAGES[index];
  }, [isLoading, loadingStep]);

  const handleGenerateVideo = async () => {
    if (!selectedImage) {
      setError('Pilih salah satu gambar untuk dijadikan video.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setLoadingStep('Membuat video...');
    setVideoUrl(null);

    try {
      let operation = await generateVideo(formState, selectedImage);
      
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await pollVideoOperation(operation);
      }
      
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoBlob = await fetchVideoWithApiKey(downloadLink);
        setVideoUrl(URL.createObjectURL(videoBlob));
      } else {
        throw new Error('Gagal mendapatkan link download video.');
      }

    } catch (err) {
      console.error(err);
      setError('Gagal membuat video. Coba lagi nanti.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const renderStep = (step: number, title: string, children: React.ReactNode) => (
    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
      <h2 className="text-2xl font-bold mb-4 flex items-center">
        <span className="bg-indigo-600 text-white rounded-full h-8 w-8 flex items-center justify-center mr-3">{step}</span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <main className="container mx-auto p-4 md:p-8">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
            VEO AI Video Generator
          </h1>
          <p className="text-gray-400 mt-2">Buat video promosi produk yang menarik dalam hitungan menit.</p>
        </header>
        
        <div className="space-y-8">
          {renderStep(1, "Informasi Produk", (
            <>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Foto Produk</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                      <div className="space-y-1 text-center">
                        <i className="fas fa-image mx-auto h-12 w-12 text-gray-500"></i>
                        <div className="flex text-sm text-gray-500">
                           <label htmlFor="product-image-upload" className="relative cursor-pointer bg-gray-700 rounded-md font-medium text-indigo-400 hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 focus-within:ring-indigo-500 px-2 py-1">
                              <span>Unggah file</span>
                              <input id="product-image-upload" name="productImage" type="file" className="sr-only" onChange={handleProductImageChange} accept="image/*" />
                          </label>
                          <p className="pl-1">atau seret dan lepas</p>
                        </div>
                        <p className="text-xs text-gray-600">PNG, JPG, GIF hingga 10MB</p>
                      </div>
                    </div>
                     <div className="mt-4 flex items-center">
                        <input id="removeBg" name="removeBg" type="checkbox" checked={formState.removeBg} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-500 bg-gray-700 rounded" />
                        <label htmlFor="removeBg" className="ml-2 block text-sm text-gray-300">Hapus background otomatis</label>
                    </div>
                  </div>
                   {formState.productImagePreview && (
                    <div className="text-center">
                       <label className="block text-sm font-medium text-gray-400 mb-2">Pratinjau</label>
                       <img src={formState.productImagePreview} alt="Pratinjau Produk" className="max-h-48 mx-auto rounded-lg bg-gray-700 p-1" />
                    </div>
                  )}
               </div>
              <input type="text" name="productName" placeholder="Nama Produk (terisi otomatis)" value={formState.productName} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"/>
              <textarea name="productDescription" placeholder="Deskripsi Produk (terisi otomatis)" value={formState.productDescription} onChange={handleInputChange} rows={3} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"></textarea>
              <input type="text" name="targetAudience" placeholder="Target Audience (terisi otomatis)" value={formState.targetAudience} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"/>
            </>
          ))}

          {renderStep(2, "Karakter (Opsional)", (
            <>
              <div className="flex space-x-4 border-b border-gray-700 mb-4">
                  <button onClick={() => setFormState(p => ({...p, characterInputMode: 'describe'}))} className={`py-2 px-4 text-sm font-medium ${formState.characterInputMode === 'describe' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-gray-200'}`}>Deskripsikan Karakter</button>
                  <button onClick={() => setFormState(p => ({...p, characterInputMode: 'upload'}))} className={`py-2 px-4 text-sm font-medium ${formState.characterInputMode === 'upload' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-gray-200'}`}>Unggah Gambar</button>
              </div>

              {formState.characterInputMode === 'upload' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                   <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Foto Model/Karakter</label>
                      <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                        <div className="space-y-1 text-center">
                          <i className="fas fa-user mx-auto h-12 w-12 text-gray-500"></i>
                           <div className="flex text-sm text-gray-500">
                             <label htmlFor="character-image-upload" className="relative cursor-pointer bg-gray-700 rounded-md font-medium text-indigo-400 hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 focus-within:ring-indigo-500 px-2 py-1">
                                <span>Unggah file</span>
                                <input id="character-image-upload" name="characterImage" type="file" className="sr-only" onChange={handleCharacterImageChange} accept="image/*" />
                            </label>
                          </div>
                          <p className="text-xs text-gray-600">PNG, JPG, dll</p>
                        </div>
                      </div>
                    </div>
                     {formState.characterImagePreview && (
                      <div className="text-center">
                         <label className="block text-sm font-medium text-gray-400 mb-2">Pratinjau Karakter</label>
                         <img src={formState.characterImagePreview} alt="Pratinjau Karakter" className="max-h-48 mx-auto rounded-lg bg-gray-700 p-1" />
                      </div>
                    )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select name="characterGender" value={formState.characterGender} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                      {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select name="characterEthnicity" value={formState.characterEthnicity} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                      {Object.values(Ethnicity).map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <textarea name="characterDescription" placeholder="Deskripsi karakter (contoh: wanita muda, rambut pirang, tersenyum, mengenakan jaket kulit)" value={formState.characterDescription} onChange={handleInputChange} rows={3} className="w-full md:col-span-2 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"></textarea>
                </div>
              )}
            </>
          ))}
          
          {renderStep(3, "Pengaturan Video", (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select name="location" value={formState.location} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select name="template" value={formState.template} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                {TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select name="videoStyle" value={formState.videoStyle} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                {VIDEO_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="text" name="cta" placeholder="Call to Action (CTA)" value={formState.cta} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          ))}

          <div className="text-center">
            <button onClick={handleGenerateImages} disabled={isLoading || !formState.productImage} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors shadow-lg text-lg">
              <i className="fas fa-images mr-2"></i>
              Generate Gambar
            </button>
          </div>
          
          {isLoading && loadingStep && (
            <div className="text-center p-4 bg-gray-800 rounded-lg">
                <div className="flex justify-center items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{loadingStep}</span>
                </div>
                 {loadingMessage && <p className="text-sm text-gray-400 mt-2">{loadingMessage}</p>}
            </div>
          )}

          {error && <div className="text-center p-4 bg-red-900 border border-red-700 text-red-200 rounded-lg">{error}</div>}

          {generatedImages.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-center">Pilih Gambar untuk Video Anda</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {generatedImages.map((img) => (
                  <div key={img.id} onClick={() => setSelectedImage(img)} className={`cursor-pointer rounded-lg overflow-hidden transition-all duration-300 ${selectedImage?.id === img.id ? 'ring-4 ring-indigo-500' : 'ring-2 ring-transparent hover:ring-indigo-500'}`}>
                    <img src={img.url} alt="Generated Variation" className="w-full h-full object-cover"/>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedImage && (
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-center">Pengaturan Akhir & Generate Video</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center justify-center">
                <div className="flex flex-col items-center">
                   <label className="text-sm font-medium text-gray-400 mb-2">Aspek Rasio</label>
                   <div className="flex space-x-2">
                       {(Object.keys(AspectRatio) as Array<keyof typeof AspectRatio>).map(key => (
                         <button key={key} onClick={() => setFormState(p => ({...p, aspectRatio: AspectRatio[key]}))} className={`px-4 py-2 rounded-md text-sm ${formState.aspectRatio === AspectRatio[key] ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{AspectRatio[key]}</button>
                       ))}
                   </div>
                </div>
                <div className="flex flex-col items-center">
                   <label className="text-sm font-medium text-gray-400 mb-2">Resolusi</label>
                   <div className="flex space-x-2">
                       {(Object.keys(Resolution) as Array<keyof typeof Resolution>).map(key => (
                         <button key={key} onClick={() => setFormState(p => ({...p, resolution: Resolution[key]}))} className={`px-4 py-2 rounded-md text-sm ${formState.resolution === Resolution[key] ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{Resolution[key]}</button>
                       ))}
                   </div>
                </div>
                <div className="flex justify-center items-center">
                    <input id="soundEnabled" name="soundEnabled" type="checkbox" checked={formState.soundEnabled} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-500 bg-gray-700 rounded" />
                    <label htmlFor="soundEnabled" className="ml-2 block text-sm text-gray-300">Aktifkan Suara</label>
                </div>
              </div>
              <div className="text-center mt-6">
                <button onClick={handleGenerateVideo} disabled={isLoading} className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors shadow-lg text-lg">
                  <i className="fas fa-video mr-2"></i>
                  Generate Video
                </button>
              </div>
            </div>
          )}

          {videoUrl && (
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                <h2 className="text-2xl font-bold mb-4 text-center">Video Anda Telah Siap!</h2>
                <video src={videoUrl} controls className="w-full max-w-2xl mx-auto rounded-lg"></video>
                <div className="text-center mt-4">
                  <a href={videoUrl} download="video_promosi.mp4" className="inline-block px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
                     <i className="fas fa-download mr-2"></i>
                    Unduh Video
                  </a>
                </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;