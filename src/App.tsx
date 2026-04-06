/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Database, 
  FileText, 
  Calendar, 
  Users, 
  Info, 
  ChevronRight,
  Menu,
  X,
  Bell,
  Search,
  PlusCircle,
  BarChart3,
  ShieldCheck,
  Zap,
  Heart,
  Handshake,
  Lightbulb,
  CheckCircle2,
  LogOut,
  LogIn
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc, 
  getDocs,
  getDocFromServer,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In a real app, we might show a toast here
};

// --- Components ---

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError('Gagal masuk dengan Google. Silakan coba lagi.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-black text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        
        <div className="text-center mb-10 relative z-10">
          <div className="w-20 h-20 bg-yellow-400 rounded-3xl flex items-center justify-center text-black font-black text-4xl mx-auto mb-6 shadow-lg shadow-yellow-400/20">
            P
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2">PIK-P DIGITAL HUB</h1>
          <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">BKPSDM Polewali Mandar</p>
        </div>

        <div className="space-y-6 relative z-10">
          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold rounded-2xl text-center"
            >
              {error}
            </motion.div>
          )}

          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-4 bg-white text-black font-black rounded-2xl shadow-lg hover:bg-zinc-100 transition-all transform active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={20} />
                MASUK DENGAN GOOGLE
              </>
            )}
          </button>
          
          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black px-2 text-zinc-500 font-bold tracking-widest">Akses Staf</span>
            </div>
          </div>

          <p className="text-center text-zinc-500 text-xs leading-relaxed">
            Gunakan akun email instansi atau email yang telah terdaftar untuk mengakses portal data.
          </p>
        </div>

        <p className="mt-10 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
          Akses Terbatas • Staf Bidang PIK-P
        </p>
      </motion.div>
    </div>
  );
};

const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen }: any) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'datacenter', label: 'Pusat Data', icon: Database },
    { id: 'services', label: 'Layanan Digital', icon: FileText },
    { id: 'workhub', label: 'Work Hub', icon: Calendar },
    { id: 'berakhlak', label: 'ASN BerAKHLAK', icon: ShieldCheck },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : -300 }}
        className={cn(
          "fixed top-0 left-0 h-full w-64 bg-yellow-400 text-black z-50 shadow-2xl transition-all duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-20"
        )}
        style={{ x: undefined }} // Let Tailwind handle the positioning on desktop if closed
      >
        <div className="p-6 flex items-center justify-between border-b border-yellow-500/30">
          <div className={cn("flex items-center gap-3 overflow-hidden transition-all duration-300", !isOpen && "lg:w-0 lg:opacity-0")}>
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-yellow-400 font-bold text-xl shrink-0">
              P
            </div>
            <span className="font-bold text-lg whitespace-nowrap">PIK-P HUB</span>
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-yellow-500 rounded-lg transition-colors shrink-0">
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (window.innerWidth < 1024) setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all group",
                activeTab === item.id 
                  ? "bg-black text-yellow-400 shadow-lg" 
                  : "hover:bg-yellow-500 text-black/80"
              )}
            >
              <item.icon size={22} className={cn(activeTab === item.id ? "scale-110" : "group-hover:scale-110")} />
              <span className={cn("font-medium transition-opacity", !isOpen && "lg:opacity-0")}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className={cn("absolute bottom-8 left-0 w-full px-6", !isOpen && "lg:hidden")}>
          <div className="bg-black/5 p-4 rounded-2xl border border-black/10">
            <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">BKPSDM Polman</p>
            <p className="text-sm font-medium">Bidang PIK-P</p>
          </div>
        </div>
      </motion.aside>
    </>
  );
};

const Dashboard = ({ user }: { user: any }) => {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestCount, setRequestCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);

  const isAdmin = user?.email === 'saininda@gmail.com';

  useEffect(() => {
    // Listen to static stats
    const q = query(collection(db, 'stats'), orderBy('order', 'asc'));
    const unsubscribeStats = onSnapshot(q, (snapshot) => {
      const statsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStats(statsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stats');
      setLoading(false);
    });

    // Listen to real requests count
    const unsubscribeRequests = onSnapshot(collection(db, 'requests'), (snapshot) => {
      setRequestCount(snapshot.size);
    });

    // Listen to real staff count
    const unsubscribeStaff = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStaffCount(snapshot.size);
    });

    return () => {
      unsubscribeStats();
      unsubscribeRequests();
      unsubscribeStaff();
    };
  }, []);

  const seedStats = async () => {
    const initialStats = [
      { label: 'Total Dokumen', value: '1,284', icon: 'Database', color: 'bg-yellow-400', order: 1 },
      { label: 'Permintaan Data', value: '0', icon: 'FileText', color: 'bg-black text-white', order: 2, isDynamic: true, dynamicKey: 'requests' },
      { label: 'Staf Aktif', value: '0', icon: 'Users', color: 'bg-zinc-100', order: 3, isDynamic: true, dynamicKey: 'staff' },
      { label: 'Efisiensi Kerja', value: '94%', icon: 'Zap', color: 'bg-yellow-100', order: 4 },
    ];

    try {
      for (const stat of initialStats) {
        await setDoc(doc(db, 'stats', stat.label.toLowerCase().replace(/\s+/g, '-')), stat);
      }
      alert('Data statistik berhasil diinisialisasi!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'stats');
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Database': return Database;
      case 'FileText': return FileText;
      case 'Users': return Users;
      case 'Zap': return Zap;
      default: return Database;
    }
  };

  const getDisplayValue = (stat: any) => {
    if (stat.isDynamic) {
      if (stat.dynamicKey === 'requests') return requestCount.toString();
      if (stat.dynamicKey === 'staff') return staffCount.toString();
    }
    return stat.value;
  };

  const data = [
    { name: 'Jan', data: 400, requests: 240 },
    { name: 'Feb', data: 300, requests: 139 },
    { name: 'Mar', data: 200, requests: 980 },
    { name: 'Apr', data: 278, requests: 390 },
    { name: 'May', data: 189, requests: 480 },
    { name: 'Jun', data: 239, requests: 380 },
  ];

  const pieData = [
    { name: 'Kepegawaian', value: 400 },
    { name: 'Pembinaan', value: 300 },
    { name: 'Informasi', value: 300 },
    { name: 'Umum', value: 200 },
  ];

  const COLORS = ['#000000', '#FACC15', '#71717A', '#A1A1AA'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight">DASHBOARD UTAMA</h1>
          <p className="text-zinc-500 mt-2">Pantau statistik data dan aktivitas Bidang PIK-P secara real-time.</p>
        </div>
        {(stats.length === 0 || isAdmin) && !loading && (
          <button 
            onClick={seedStats}
            className="px-4 py-2 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all"
          >
            {stats.length === 0 ? 'Inisialisasi Data' : 'Update Struktur Stats'}
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-zinc-100 animate-pulse rounded-3xl" />
          ))
        ) : (
          stats.map((stat, i) => {
            const Icon = getIcon(stat.icon);
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={stat.id}
                className={cn("p-6 rounded-3xl shadow-sm border border-black/5 flex items-center justify-between", stat.color)}
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-60">{stat.label}</p>
                  <p className="text-3xl font-black mt-1">{getDisplayValue(stat)}</p>
                </div>
                <Icon size={32} className="opacity-20" />
              </motion.div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-xl flex items-center gap-2">
              <BarChart3 className="text-yellow-500" /> Statistik Input Data
            </h3>
            <select className="bg-zinc-50 border-none text-sm font-medium rounded-lg px-3 py-1">
              <option>6 Bulan Terakhir</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="data" fill="#FACC15" radius={[4, 4, 0, 0]} />
                <Bar dataKey="requests" fill="#000000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
          <h3 className="font-bold text-xl mb-8 flex items-center gap-2">
            <Database className="text-yellow-500" /> Distribusi Kategori Data
          </h3>
          <div className="h-[300px] w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-4 pr-8">
              {pieData.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DataCenter = () => {
  const categories = [
    { name: 'Pengadaan Pegawai', count: 450, icon: Users, url: 'https://drive.google.com/drive/folders/1p-TyEk9e1w-lAzrJOdIamGxWWAsw_fsl?usp=drive_link' },
    { name: 'Informasi Pegawai', count: 820, icon: FileText, url: 'https://drive.google.com/drive/folders/1DXI4hiGoYkbuHEZ-JBkxTlXcAL8HycBw?usp=drive_link' },
    { name: 'Kinerja Pegawai', count: 120, icon: BarChart3, url: 'https://drive.google.com/drive/folders/1m2ftZNc1jy9EnSVICg7fCpk-vK5LOdma?usp=drive_link' },
    { name: 'Arsip Digital', count: 2400, icon: Database, url: 'https://drive.google.com/drive/folders/YOUR_FOLDER_ID_4' },
  ];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-4xl font-black text-black tracking-tight">PUSAT DATA DIGITAL</h1>
        <p className="text-zinc-500 mt-2">Akses cepat ke seluruh repositori data Bidang PIK-P.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map((cat, i) => (
          <motion.div 
            whileHover={{ y: -5 }}
            key={i} 
            onClick={() => window.open(cat.url, '_blank')}
            className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <cat.icon size={24} />
            </div>
            <h3 className="font-bold text-lg">{cat.name}</h3>
            <p className="text-sm text-zinc-400 mt-1">{cat.count} File Tersimpan</p>
            <div className="mt-4 flex items-center text-xs font-bold text-yellow-600 uppercase tracking-wider">
              Buka Folder <ChevronRight size={14} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold">File Terbaru</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input 
              type="text" 
              placeholder="Cari dokumen..." 
              className="pl-10 pr-4 py-2 bg-zinc-50 border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-yellow-400"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-50 text-xs font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-6 py-4">Nama Dokumen</th>
                <th className="px-6 py-4">Kategori</th>
                <th className="px-6 py-4">Tanggal</th>
                <th className="px-6 py-4">Ukuran</th>
                <th className="px-6 py-4">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {[
                { name: 'SK_Kenaikan_Pangkat_2024.pdf', cat: 'Informasi Pegawai', date: '12 Mar 2024', size: '2.4 MB', url: 'https://drive.google.com/file/d/YOUR_FILE_ID_1/view' },
                { name: 'Data_Statistik_Pegawai_Q1.xlsx', cat: 'Pengadaan Pegawai', date: '10 Mar 2024', size: '1.1 MB', url: 'https://drive.google.com/file/d/YOUR_FILE_ID_2/view' },
                { name: 'Laporan_PIKP_Bulanan.docx', cat: 'Kinerja Pegawai', date: '08 Mar 2024', size: '850 KB', url: 'https://drive.google.com/file/d/YOUR_FILE_ID_3/view' },
                { name: 'Arsip_Pembinaan_Disiplin.pdf', cat: 'Arsip Digital', date: '05 Mar 2024', size: '4.2 MB', url: 'https://drive.google.com/file/d/YOUR_FILE_ID_4/view' },
              ].map((file, i) => (
                <tr key={i} className="hover:bg-zinc-50 transition-colors group">
                  <td className="px-6 py-4 font-medium flex items-center gap-3">
                    <div className="w-8 h-8 bg-zinc-100 rounded flex items-center justify-center text-zinc-400 group-hover:bg-yellow-100 group-hover:text-yellow-600">
                      <FileText size={16} />
                    </div>
                    {file.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{file.cat}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{file.date}</td>
                  <td className="px-6 py-4 text-sm text-zinc-500">{file.size}</td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => window.open(file.url, '_blank')}
                      className="text-yellow-600 font-bold text-xs uppercase hover:underline"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Services = () => {
  const [formData, setFormData] = useState({
    requesterName: '',
    unit: '',
    dataType: 'Data Statistik Pegawai',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      await addDoc(collection(db, 'requests'), {
        ...formData,
        status: 'pending',
        createdAt: new Date().toISOString(),
        uid: auth.currentUser.uid
      });
      setSuccess(true);
      setFormData({ requesterName: '', unit: '', dataType: 'Data Statistik Pegawai', reason: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requests');
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    processing: requests.filter(r => r.status === 'processing').length,
    completed: requests.filter(r => r.status === 'completed').length
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-black text-black tracking-tight">LAYANAN DIGITAL</h1>
        <p className="text-zinc-500 mt-2">Formulir interaktif untuk mempermudah alur kerja staf.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
          <h3 className="font-bold text-xl mb-6">Form Permintaan Data</h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            {success && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-emerald-50 text-emerald-600 text-sm font-bold rounded-2xl border border-emerald-100"
              >
                Permintaan data berhasil dikirim!
              </motion.div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Nama Pemohon</label>
                <input 
                  type="text" 
                  required
                  value={formData.requesterName}
                  onChange={e => setFormData({...formData, requesterName: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border-none rounded-2xl focus:ring-2 focus:ring-yellow-400" 
                  placeholder="Masukkan nama lengkap" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Unit Kerja</label>
                <input 
                  type="text" 
                  required
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border-none rounded-2xl focus:ring-2 focus:ring-yellow-400" 
                  placeholder="Contoh: Bidang Mutasi" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Jenis Data yang Dibutuhkan</label>
              <select 
                value={formData.dataType}
                onChange={e => setFormData({...formData, dataType: e.target.value})}
                className="w-full p-3 bg-zinc-50 border-none rounded-2xl focus:ring-2 focus:ring-yellow-400"
              >
                <option>Data Statistik Pegawai</option>
                <option>Dokumen SK</option>
                <option>Data Pembinaan</option>
                <option>Lainnya</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Alasan Permintaan</label>
              <textarea 
                required
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
                className="w-full p-3 bg-zinc-50 border-none rounded-2xl focus:ring-2 focus:ring-yellow-400 h-32" 
                placeholder="Jelaskan keperluan penggunaan data..."
              ></textarea>
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl shadow-lg shadow-yellow-400/20 hover:bg-yellow-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <PlusCircle size={20} /> KIRIM PERMINTAAN
                </>
              )}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-black text-yellow-400 p-8 rounded-3xl shadow-xl">
            <h3 className="font-bold text-xl mb-4">Status Layanan</h3>
            <div className="space-y-4">
              {[
                { label: 'Permintaan Masuk', value: stats.pending, icon: Bell },
                { label: 'Sedang Diproses', value: stats.processing, icon: Zap },
                { label: 'Selesai Hari Ini', value: stats.completed, icon: CheckCircle2 },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                  <div className="flex items-center gap-3">
                    <item.icon size={18} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <span className="font-black text-lg">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 p-6 rounded-3xl border border-yellow-200">
            <h4 className="font-bold text-yellow-800 mb-2">Informasi Penting</h4>
            <p className="text-sm text-yellow-700 leading-relaxed">
              Seluruh permintaan data akan diproses maksimal 1x24 jam kerja sesuai dengan SOP Bidang PIK-P.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkHub = () => {
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const calendar = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      <header>
        <h1 className="text-4xl font-black text-black tracking-tight">WORK HUB</h1>
        <p className="text-zinc-500 mt-2">Pusat kolaborasi dan manajemen tugas harian staf.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-xl flex items-center gap-2">
                <Calendar className="text-yellow-500" /> Kalender Kegiatan
              </h3>
              <div className="flex gap-2">
                <button className="p-2 hover:bg-zinc-100 rounded-lg">Prev</button>
                <span className="font-bold px-4 py-2">Maret 2024</span>
                <button className="p-2 hover:bg-zinc-100 rounded-lg">Next</button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map(day => (
                <div key={day} className="text-center text-xs font-bold text-zinc-400 py-2 uppercase tracking-widest">{day}</div>
              ))}
              {calendar.map(date => (
                <div 
                  key={date} 
                  className={cn(
                    "aspect-square flex flex-col items-center justify-center rounded-2xl text-sm font-medium transition-all cursor-pointer relative",
                    date === 17 ? "bg-black text-yellow-400" : "hover:bg-yellow-100",
                    [5, 12, 25].includes(date) && "after:content-[''] after:absolute after:bottom-2 after:w-1 after:h-1 after:bg-yellow-500 after:rounded-full"
                  )}
                >
                  {date}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
            <h3 className="font-bold text-xl mb-6">Tugas Tim PIK-P</h3>
            <div className="space-y-4">
              {[
                { task: 'Update Data Pensiun Maret', status: 'In Progress', priority: 'High' },
                { task: 'Verifikasi Berkas Kenaikan Pangkat', status: 'Pending', priority: 'Medium' },
                { task: 'Backup Database Kepegawaian', status: 'Completed', priority: 'High' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      item.status === 'Completed' ? 'bg-emerald-500' : item.status === 'In Progress' ? 'bg-yellow-500' : 'bg-zinc-300'
                    )} />
                    <div>
                      <p className="font-bold text-sm">{item.task}</p>
                      <p className="text-xs text-zinc-400">Prioritas: {item.priority}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <h3 className="font-bold text-xl mb-8 relative z-10">Papan Pengumuman</h3>
          <div className="space-y-8 relative z-10">
            {[
              { title: 'Rapat Koordinasi Bidang', time: '14:00 WITA', date: 'Besok', color: 'border-yellow-400' },
              { title: 'Batas Input Data e-Kinerja', time: '23:59 WITA', date: '20 Mar', color: 'border-zinc-700' },
              { title: 'Pelatihan Dashboard Baru', time: '09:00 WITA', date: '25 Mar', color: 'border-zinc-700' },
            ].map((news, i) => (
              <div key={i} className={cn("pl-4 border-l-2 space-y-1", news.color)}>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{news.date} • {news.time}</p>
                <h4 className="font-bold text-sm leading-tight">{news.title}</h4>
              </div>
            ))}
          </div>
          <button className="w-full mt-12 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all">
            LIHAT SEMUA PENGUMUMAN
          </button>
        </div>
      </div>
    </div>
  );
};

const BerAKHLAK = () => {
  const values = [
    { 
      title: 'Berorientasi Pelayanan', 
      desc: 'Portal ini menyediakan Form Permintaan Data yang responsif untuk memenuhi kebutuhan staf dengan cepat.',
      icon: Heart,
      color: 'text-rose-500'
    },
    { 
      title: 'Akuntabel', 
      desc: 'Setiap data terdokumentasi dengan baik di Pusat Data Digital, menjamin transparansi dan tanggung jawab.',
      icon: ShieldCheck,
      color: 'text-blue-500'
    },
    { 
      title: 'Kompeten', 
      desc: 'Fitur Work Hub memfasilitasi peningkatan kinerja staf melalui manajemen tugas yang terorganisir.',
      icon: BarChart3,
      color: 'text-emerald-500'
    },
    { 
      title: 'Harmonis', 
      desc: 'Papan Pengumuman digital memastikan seluruh staf mendapatkan informasi yang sama untuk keselarasan kerja.',
      icon: Handshake,
      color: 'text-orange-500'
    },
    { 
      title: 'Loyal', 
      desc: 'Sistem keamanan data yang ketat menjaga kerahasiaan informasi negara dan instansi.',
      icon: CheckCircle2,
      color: 'text-indigo-500'
    },
    { 
      title: 'Adaptif', 
      desc: 'Transformasi dari penyimpanan fisik ke Digital Hub menunjukkan kesiapan PIK-P menghadapi era digital.',
      icon: Zap,
      color: 'text-yellow-500'
    },
    { 
      title: 'Kolaboratif', 
      desc: 'Work Hub menjadi ruang kerja bersama untuk mencapai tujuan organisasi secara kolektif.',
      icon: Users,
      color: 'text-purple-500'
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-black text-black tracking-tight">ASN BerAKHLAK</h1>
        <p className="text-zinc-500 mt-2">Bagaimana Portal PIK-P Digital Hub mengimplementasikan nilai-nilai inti ASN.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {values.map((v, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            key={i} 
            className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-xl transition-all"
          >
            <v.icon size={32} className={cn("mb-4", v.color)} />
            <h3 className="font-bold text-xl mb-3">{v.title}</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">{v.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-yellow-400 p-12 rounded-[3rem] text-center space-y-6 mt-12">
        <h2 className="text-3xl font-black">Membangun Budaya Kerja Digital</h2>
        <p className="text-black/70 max-w-xl mx-auto font-medium">
          "Portal ini bukan sekadar alat, melainkan manifestasi integritas dan dedikasi kita sebagai pelayan publik di BKPSDM Polewali Mandar."
        </p>
        <div className="flex justify-center gap-4">
          <div className="w-12 h-1 bg-black rounded-full" />
          <div className="w-12 h-1 bg-black/20 rounded-full" />
          <div className="w-12 h-1 bg-black/20 rounded-full" />
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Save user to Firestore
        try {
          await setDoc(doc(db, 'users', user.uid), {
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            lastLogin: new Date().toISOString(),
            role: user.email === 'saininda@gmail.com' ? 'admin' : 'staff'
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'users');
        }
      }
      setUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-yellow-400 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard user={user} />;
      case 'datacenter': return <DataCenter />;
      case 'services': return <Services />;
      case 'workhub': return <WorkHub />;
      case 'berakhlak': return <BerAKHLAK />;
      default: return <Dashboard />;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 selection:bg-yellow-200">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />

      <main className={cn(
        "transition-all duration-300 min-h-screen p-4 lg:p-8",
        isSidebarOpen ? "lg:ml-64" : "lg:ml-20"
      )}>
        <div className="max-w-7xl mx-auto">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              {!isSidebarOpen && (
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-3 bg-yellow-400 text-black rounded-2xl shadow-lg shadow-yellow-400/20 hover:bg-yellow-500 transition-all lg:hidden"
                >
                  <Menu size={20} />
                </button>
              )}
              <div className="hidden lg:block">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">Selamat Pagi,</p>
                <h2 className="text-lg font-bold">{user.displayName || 'Staf PIK-P'}</h2>
              </div>
            </div>
            
            <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-black/5">
              <button className="p-2 hover:bg-zinc-100 rounded-xl transition-colors relative">
                <Bell size={20} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full border-2 border-white" />
              </button>
              <div className="h-8 w-[1px] bg-zinc-100" />
              <div className="flex items-center gap-3 px-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold">{user.displayName || 'User'}</p>
                  <button 
                    onClick={handleLogout}
                    className="text-[10px] text-rose-500 font-bold uppercase tracking-wider hover:underline"
                  >
                    Keluar
                  </button>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center font-black">
                    {user.displayName?.substring(0, 2).toUpperCase() || 'AD'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="mt-20 py-8 border-t border-zinc-200 text-center">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
            © 2026 Bidang PIK-P BKPSDM Polewali Mandar • Digital Hub Portal
          </p>
        </footer>
      </main>
    </div>
  );
}
