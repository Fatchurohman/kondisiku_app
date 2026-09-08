import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Konfigurasi Kredensial Firebase Console Anda
const konfigurasiFirebase = {
  apiKey: "KUNCI_API_ANDA",
  authDomain: "ID_PROYEK_ANDA.firebaseapp.com",
  projectId: "ID_PROYEK_ANDA",
  storageBucket: "ID_PROYEK_ANDA.appspot.com",
  messagingSenderId: "ID_PENGIRIM_ANDA",
  appId: "ID_APLIKASI_ANDA"
};

// Inisialisasi Firebase
const aplikasiFirebase = initializeApp(konfigurasiFirebase);
const basisData = getFirestore(aplikasiFirebase);

/**
 * MesinPenalaranKesehatan
 * Melakukan validasi angka vital dan klasifikasi klinis berbasis aturan.
 */
class MesinPenalaranKesehatan {
  constructor(dataMentah) {
    this.data = this._bersihkanData(dataMentah);
  }

  _bersihkanData(masukan) {
    if (!masukan || typeof masukan !== "object") {
      throw new TypeError("Data masukan harus berupa objek yang valid.");
    }

    return {
      tensiDuduk: Math.abs(Number(masukan.tensiDuduk)) || 0,
      tensiBerdiri: Math.abs(Number(masukan.tensiBerdiri)) || 0,
      nadiDuduk: Math.abs(Number(masukan.nadiDuduk)) || 0,
      nadiBerdiri: Math.abs(Number(masukan.nadiBerdiri)) || 0,
      gulaPuasa: masukan.gulaPuasa !== "" && masukan.gulaPuasa !== null 
        ? Math.abs(Number(masukan.gulaPuasa)) 
        : null,
      gejala: Array.isArray(masukan.gejala) ? masukan.gejala : []
    };
  }

  evaluasiVaskular() {
    const { tensiDuduk, tensiBerdiri, nadiDuduk, nadiBerdiri } = this.data;
    const selisihTensi = tensiDuduk - tensiBerdiri;
    const selisihNadi = nadiBerdiri - nadiDuduk;

    if (selisihTensi >= 20) {
      const responsTakikardia = selisihNadi >= 30;
      return {
        terjadiHipotensiPostural: true,
        penurunanSistolik: selisihTensi,
        kenaikanNadi: selisihNadi,
        tingkatKeparahan: selisihTensi >= 30 ? "BERAT" : "SEDANG",
        ringkasan: `Ditemukan penurunan tekanan sistolik ortostatik sebesar ${selisihTensi} mmHg saat berdiri. ${responsTakikardia ? "Disertai kompensasi lonjakan detak nadi tinggi (>30 bpm)." : "Penurunan tekanan darah postural tunggal."}`
      };
    }

    return {
      terjadiHipotensiPostural: false,
      penurunanSistolik: selisihTensi,
      kenaikanNadi: selisihNadi,
      tingkatKeparahan: "NORMAL",
      ringkasan: `Regulasi tekanan vaskular postural normal (Variasi sistolik: ${selisihTensi} mmHg, selisih nadi: ${selisihNadi} bpm).`
    };
  }

  evaluasiMetabolik() {
    const { gulaPuasa } = this.data;
    if (gulaPuasa === null || isNaN(gulaPuasa)) {
      return { status: "TIDAK_DIISI", peringatan: false, ringkasan: "Data glukosa puasa tidak dimasukkan." };
    }

    if (gulaPuasa < 70) {
      return { status: "HIPOGLIKEMIA", peringatan: true, ringkasan: `Gula darah berada di bawah batas normal (${gulaPuasa} mg/dL) - Indikasi Hipoglikemia.` };
    }
    if (gulaPuasa >= 126) {
      return { status: "HIPERGLIKEMIA_DIABETES", peringatan: true, ringkasan: `Gula darah puasa melampaui ambang batas normal (${gulaPuasa} mg/dL) - Indikasi Diabetes Mellitus.` };
    }
    if (gulaPuasa >= 100) {
      return { status: "PRA_DIABETES", peringatan: false, ringkasan: `Gula darah puasa berada pada ambang toleransi terganggu (${gulaPuasa} mg/dL) - Fase Pra-Diabetes.` };
    }
    return { status: "NORMAL", peringatan: false, ringkasan: `Kadar gula darah puasa dalam rentang optimal (${gulaPuasa} mg/dL).` };
  }

  buatSintesis() {
    const vaskular = this.evaluasiVaskular();
    const metabolik = this.evaluasiMetabolik();
    const daftarGejala = this.data.gejala;

    let tingkatPrioritas = "NORMAL";
    const anjuranTindakan = [];

    // Prioritas 1: Evaluasi Gejala Tanda Bahaya (Red Flag)
    const adaNyeriDada = daftarGejala.includes("nyeri_dada");
    const adaSesakNapas = daftarGejala.includes("sesak_napas");

    if (adaNyeriDada || adaSesakNapas) {
      tingkatPrioritas = "DARURAT";
      anjuranTindakan.push("PERINGATAN KRITIS: Indikasi nyeri dada atau sesak napas akut terdeteksi. Segera bawa ke IGD atau hubungi layanan ambulans gawat darurat.");
    }

    // Prioritas 2: Evaluasi Regulasi Vaskular Postural
    if (vaskular.terjadiHipotensiPostural) {
      if (tingkatPrioritas !== "DARURAT") {
        tingkatPrioritas = vaskular.tingkatKeparahan === "BERAT" ? "MENDESAK" : "WASPADA";
      }
      anjuranTindakan.push("Cukupi asupan hidrasi dan elektrolit. Hindari perubahan posisi bangun atau berdiri secara mendadak (lakukan jeda duduk terlebih dahulu).");
    }

    // Prioritas 3: Evaluasi Profil Gula Darah
    if (metabolik.peringatan) {
      if (tingkatPrioritas !== "DARURAT" && tingkatPrioritas !== "MENDESAK") {
        tingkatPrioritas = "WASPADA";
      }
      anjuranTindakan.push(`Lakukan evaluasi profil gula darah lanjutan ke fasilitas kesehatan (${metabolik.ringkasan}).`);
    }

    // Kondisi Tubuh Normal
    if (anjuranTindakan.length === 0) {
      anjuranTindakan.push("Semua fakta indikator vital berada dalam batas toleransi homeostatis normal. Pertahankan pola hidup sehat dan hidrasi yang cukup.");
    }

    return {
      tingkatPrioritas,
      vaskular,
      metabolik,
      anjuranTindakan
    };
  }
}

// Elemen DOM
const form = document.getElementById("formulirKesehatan");
const tombolProses = document.getElementById("tombolProses");
const kartuHasil = document.getElementById("kartuHasil");
const lencanaPrioritas = document.getElementById("lencanaPrioritas");
const hasilVaskular = document.getElementById("hasilVaskular");
const hasilMetabolik = document.getElementById("hasilMetabolik");
const daftarRekomendasi = document.getElementById("daftarRekomendasi");
const statusPenyimpanan = document.getElementById("statusPenyimpanan");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  tombolProses.disabled = true;
  tombolProses.textContent = "Sedang Menganalisis...";
  statusPenyimpanan.textContent = "Status Basis Data: Memproses data...";

  try {
    const gejalaTerpilih = Array.from(
      document.querySelectorAll('input[name="gejala"]:checked')
    ).map((cb) => cb.value);

    const dataMasukan = {
      tensiDuduk: document.getElementById("tensiDuduk").value,
      tensiBerdiri: document.getElementById("tensiBerdiri").value,
      nadiDuduk: document.getElementById("nadiDuduk").value,
      nadiBerdiri: document.getElementById("nadiBerdiri").value,
      gulaPuasa: document.getElementById("gulaPuasa").value,
      gejala: gejalaTerpilih
    };

    // Jalankan Penalaran
    const mesin = new MesinPenalaranKesehatan(dataMasukan);
    const sintesis = mesin.buatSintesis();

    // Tampilkan Hasil ke Layar
    tampilkanHasil(sintesis);

    // Kirim Hasil ke Firestore
    statusPenyimpanan.textContent = "Status Basis Data: Menyimpan rekaman ke Firebase...";
    await addDoc(collection(basisData, "catatan_kesehatan"), {
      indikatorInput: mesin.data,
      hasilPenalaran: sintesis,
      dibuatPada: serverTimestamp()
    });

    statusPenyimpanan.textContent = "Status Basis Data: Data berhasil disimpan ke Firebase.";
  } catch (error) {
    console.error("Gagal memproses analisis atau menyimpan ke Firebase:", error);
    statusPenyimpanan.textContent = "Status Basis Data: Gagal menyimpan data.";
    alert("Terjadi kesalahan teknis saat memproses data. Silakan periksa pengaturan Firebase.");
  } finally {
    tombolProses.disabled = false;
    tombolProses.textContent = "Jalankan Analisis & Simpan";
  }
});

function tampilkanHasil(sintesis) {
  kartuHasil.style.display = "block";

  // Pengaturan Tampilan Lencana
  lencanaPrioritas.className = "lencana";
  switch (sintesis.tingkatPrioritas) {
    case "DARURAT":
      lencanaPrioritas.classList.add("lencana-darurat");
      lencanaPrioritas.textContent = "DARURAT KRITIS (SEGERA KE IGD)";
      break;
    case "MENDESAK":
      lencanaPrioritas.classList.add("lencana-mendesak");
      lencanaPrioritas.textContent = "PERHATIAN MENDESAK";
      break;
    case "WASPADA":
      lencanaPrioritas.classList.add("lencana-waspada");
      lencanaPrioritas.textContent = "WASPADA (PERLU PEMERIKSAAN)";
      break;
    default:
      lencanaPrioritas.classList.add("lencana-normal");
      lencanaPrioritas.textContent = "KONDISI NORMAL";
      break;
  }

  hasilVaskular.textContent = sintesis.vaskular.ringkasan;
  hasilMetabolik.textContent = sintesis.metabolik.ringkasan;

  // Render Daftar Anjuran
  daftarRekomendasi.innerHTML = "";
  sintesis.anjuranTindakan.forEach((teksAnjuran) => {
    const li = document.createElement("li");
    li.textContent = teksAnjuran;
    daftarRekomendasi.appendChild(li);
  });

  kartuHasil.scrollIntoView({ behavior: "smooth", block: "start" });
}
