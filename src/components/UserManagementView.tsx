import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Shield, 
  Briefcase, 
  Eye, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Crown, 
  Info, 
  Clock, 
  UserCheck, 
  UserX, 
  Trash2, 
  RefreshCw,
  ChevronDown
} from 'lucide-react';
import { db, auth } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';

export type UserRole = 'super_admin' | 'admin' | 'staff' | 'viewer';

export interface UserProfile {
  id: string;
  displayName?: string;
  email: string;
  photoURL?: string;
  role?: UserRole | string;
  status?: 'authorized' | 'pending';
  lastLogin?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface UserManagementViewProps {
  currentUserEmail?: string;
  currentUserId?: string;
  currentUserRole?: string;
}

export const ROLE_DETAILS: Record<UserRole, {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  icon: any;
  desc: string;
}> = {
  super_admin: {
    label: 'Super Admin',
    badgeBg: 'bg-purple-100 text-purple-800',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    icon: Crown,
    desc: 'Akses penuh ke seluruh menu, kelola user & role, hapus dokumen & arsip.'
  },
  admin: {
    label: 'Admin Bidang',
    badgeBg: 'bg-amber-100 text-amber-800',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    icon: Shield,
    desc: 'Akses operasional, verifikasi SPK PPPK, hapus & arsipkan dokumen.'
  },
  staff: {
    label: 'Staf Operator',
    badgeBg: 'bg-emerald-100 text-emerald-800',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    icon: Briefcase,
    desc: 'Input, unggah, dan edit berkas (tanpa hak hapus & tanpa menu user).'
  },
  viewer: {
    label: 'Viewer',
    badgeBg: 'bg-zinc-100 text-zinc-700',
    badgeText: 'text-zinc-600',
    badgeBorder: 'border-zinc-300',
    icon: Eye,
    desc: 'Akses baca & unduh dokumen saja (Read-only, tidak dapat menambah/hapus).'
  }
};

const PRIMARY_ADMIN_EMAILS = ['saininda@gmail.com'];
const PRIMARY_ADMIN_UIDS = ['lUGYop8JDvcT2SJxjiEzBC8PD2p2'];

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUserEmail,
  currentUserId,
  currentUserRole
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showRoleGuide, setShowRoleGuide] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('lastLogin', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const userList: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          userList.push({ id: docSnap.id, ...docSnap.data() } as UserProfile);
        });
        setUsers(userList);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching users:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const isPrimaryAdmin = (user: UserProfile): boolean => {
    if (PRIMARY_ADMIN_EMAILS.includes(user.email)) return true;
    if (PRIMARY_ADMIN_UIDS.includes(user.id)) return true;
    return false;
  };

  const handleRoleChange = async (userId: string, newRole: UserRole, targetUser: UserProfile) => {
    if (isPrimaryAdmin(targetUser)) {
      alert('Level akses pemilik sistem (Super Admin Utama) bersifat permanen dan tidak dapat diubah.');
      return;
    }

    setUpdatingId(userId);
    try {
      await setDoc(
        doc(db, 'users', userId),
        { 
          role: newRole,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      showToast(`Level akses untuk ${targetUser.displayName || targetUser.email} diubah menjadi ${ROLE_DETAILS[newRole]?.label || newRole}!`, 'success');
    } catch (err: any) {
      console.error('Gagal memperbarui role user:', err);
      showToast('Gagal memperbarui level akses: ' + err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusToggle = async (user: UserProfile) => {
    if (isPrimaryAdmin(user)) {
      alert('Status akun pemilik sistem tidak dapat dinonaktifkan.');
      return;
    }

    const newStatus = user.status === 'authorized' ? 'pending' : 'authorized';
    setUpdatingId(user.id);
    try {
      await setDoc(
        doc(db, 'users', user.id),
        { 
          status: newStatus,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      showToast(
        newStatus === 'authorized'
          ? `Akses untuk ${user.displayName || user.email} berhasil diaktifkan!`
          : `Akses untuk ${user.displayName || user.email} berhasil dicabut (tertunda).`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal memperbarui status user:', err);
      showToast('Gagal memperbarui status akun: ' + err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (isPrimaryAdmin(user)) {
      alert('Akun pemilik sistem tidak dapat dihapus.');
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus user "${user.displayName || user.email}" dari sistem Cloud-P?`)) {
      return;
    }

    setUpdatingId(user.id);
    try {
      await deleteDoc(doc(db, 'users', user.id));
      showToast(`Pengguna ${user.displayName || user.email} berhasil dihapus.`, 'success');
    } catch (err: any) {
      console.error('Gagal menghapus user:', err);
      showToast('Gagal menghapus user: ' + err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (u.displayName || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }

      // 2. Role Filter
      if (selectedRoleFilter !== 'all') {
        const normalizedRole = u.role || 'staff';
        if (normalizedRole !== selectedRoleFilter) return false;
      }

      // 3. Status Filter
      if (selectedStatusFilter !== 'all') {
        const normalizedStatus = u.status || 'pending';
        if (normalizedStatus !== selectedStatusFilter) return false;
      }

      return true;
    });
  }, [users, searchQuery, selectedRoleFilter, selectedStatusFilter]);

  // Role Statistics
  const stats = useMemo(() => {
    const total = users.length;
    let superAdminCount = 0;
    let adminCount = 0;
    let staffCount = 0;
    let viewerCount = 0;
    let activeCount = 0;

    users.forEach((u) => {
      const r = u.role || 'staff';
      if (r === 'super_admin' || isPrimaryAdmin(u)) superAdminCount++;
      else if (r === 'admin') adminCount++;
      else if (r === 'viewer') viewerCount++;
      else staffCount++;

      if (u.status === 'authorized' || isPrimaryAdmin(u)) activeCount++;
    });

    return {
      total,
      superAdminCount,
      adminCount,
      staffCount,
      viewerCount,
      activeCount
    };
  }, [users]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div 
          className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-bold border animate-in slide-in-from-top-4 duration-300 ${
            toastMessage.type === 'success' 
              ? 'bg-emerald-950 text-emerald-200 border-emerald-500/40 shadow-emerald-500/20' 
              : 'bg-rose-950 text-rose-200 border-rose-500/40 shadow-rose-500/20'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-zinc-950 text-white rounded-3xl p-6 sm:p-8 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldCheck size={14} />
              Otorisasi & Hak Akses Sistem
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Manajemen User & Level Akses
            </h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-xl">
              Atur wewenang pengguna (Super Admin, Admin Bidang, Staf Operator, Viewer) dan kelola perizinan akun portal Cloud-P.
            </p>
          </div>

          <button
            onClick={() => setShowRoleGuide(!showRoleGuide)}
            className="px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-yellow-400 border border-yellow-400/30 text-xs sm:text-sm font-bold flex items-center gap-2 transition shrink-0 self-start md:self-auto"
          >
            <Info size={16} />
            <span>{showRoleGuide ? 'Sembunyikan Panduan Role' : 'Panduan Kewenangan Role'}</span>
          </button>
        </div>
      </div>

      {/* Role Guide Card (Expandable) */}
      {showRoleGuide && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-zinc-900 flex items-center gap-2">
              <ShieldCheck className="text-yellow-600" size={20} />
              Tingkatan & Hak Akses Pengguna
            </h3>
            <button 
              onClick={() => setShowRoleGuide(false)}
              className="text-xs text-zinc-400 hover:text-zinc-700 font-bold"
            >
              Tutup
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {/* Super Admin */}
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
              <div className="flex items-center gap-2 text-purple-900 font-black text-sm">
                <Crown size={16} className="text-purple-600" />
                <span>Super Admin</span>
              </div>
              <p className="text-xs text-purple-900/80 leading-relaxed">
                Akses penuh tanpa batas. Dapat membuka semua menu termasuk <strong>Manajemen User</strong>, mengubah role staf, serta menghapus dokumen/arsip.
              </p>
            </div>

            {/* Admin Bidang */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                <Shield size={16} className="text-amber-600" />
                <span>Admin Bidang</span>
              </div>
              <p className="text-xs text-amber-900/80 leading-relaxed">
                Pengelolaan operasional data lengkap: verifikasi SPK PPPK, kelola permintaan data, unggah & hapus dokumen. Tidak memiliki akses ke Manajemen User.
              </p>
            </div>

            {/* Staf Operator */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-2 text-emerald-950 font-black text-sm">
                <Briefcase size={16} className="text-emerald-600" />
                <span>Staf Operator</span>
              </div>
              <p className="text-xs text-emerald-900/80 leading-relaxed">
                Dapat menginput, mengunggah, dan mengedit data di Pusat Data, Arsip Digital, dan Work Hub. <strong>Tidak memiliki izin menghapus data</strong>.
              </p>
            </div>

            {/* Viewer */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
              <div className="flex items-center gap-2 text-zinc-900 font-black text-sm">
                <Eye size={16} className="text-zinc-600" />
                <span>Viewer (Lihat Saja)</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Mode baca (*read-only*). Hanya dapat melihat Dashboard, mencari dan mengunduh berkas. Tombol tambah, edit, dan hapus disembunyikan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Role Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider block">Total Akun</span>
            <span className="text-2xl font-black text-zinc-900 mt-0.5 block">{stats.total}</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-700 flex items-center justify-center">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-purple-600 text-[10px] font-bold uppercase tracking-wider block">Super Admin</span>
            <span className="text-2xl font-black text-purple-900 mt-0.5 block">{stats.superAdminCount}</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
            <Crown size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-amber-700 text-[10px] font-bold uppercase tracking-wider block">Admin Bidang</span>
            <span className="text-2xl font-black text-amber-900 mt-0.5 block">{stats.adminCount}</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Shield size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-emerald-700 text-[10px] font-bold uppercase tracking-wider block">Staf Operator</span>
            <span className="text-2xl font-black text-emerald-900 mt-0.5 block">{stats.staffCount}</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Briefcase size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-zinc-600 text-[10px] font-bold uppercase tracking-wider block">Viewer</span>
            <span className="text-2xl font-black text-zinc-800 mt-0.5 block">{stats.viewerCount}</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-600 flex items-center justify-center">
            <Eye size={20} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama atau alamat email pengguna..."
              className="w-full pl-11 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 transition"
            />
          </div>

          {/* Role Filter */}
          <div className="sm:w-52">
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs sm:text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
            >
              <option value="all">Semua Level Akses</option>
              <option value="super_admin">👑 Super Admin</option>
              <option value="admin">⭐ Admin Bidang</option>
              <option value="staff">💼 Staf Operator</option>
              <option value="viewer">👁️ Viewer (Lihat Saja)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="sm:w-44">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs sm:text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
            >
              <option value="all">Semua Status</option>
              <option value="authorized">Aktif</option>
              <option value="pending">Tertunda</option>
            </select>
          </div>

          {(searchQuery || selectedRoleFilter !== 'all' || selectedStatusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedRoleFilter('all');
                setSelectedStatusFilter('all');
              }}
              className="px-4 py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition shrink-0"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-zinc-400 space-y-3">
            <div className="w-8 h-8 border-3 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Memuat data pengguna & level akses...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
              <Users size={28} />
            </div>
            <h3 className="text-base font-bold text-zinc-800">Tidak Ada Pengguna Ditemukan</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Coba gunakan kata kunci pencarian lain atau sesuaikan filter role dan status.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-4 px-6">Pengguna</th>
                  <th className="py-4 px-6">Login Terakhir</th>
                  <th className="py-4 px-6">Level Akses (Wewenang)</th>
                  <th className="py-4 px-6">Status Akun</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredUsers.map((u) => {
                  const isOwner = isPrimaryAdmin(u);
                  const effectiveRole: UserRole = isOwner ? 'super_admin' : (u.role as UserRole) || 'staff';
                  const roleConfig = ROLE_DETAILS[effectiveRole] || ROLE_DETAILS.staff;
                  const RoleIcon = roleConfig.icon;
                  const isUpdatingThis = updatingId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/80 transition">
                      {/* User Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {u.photoURL ? (
                            <img 
                              src={u.photoURL} 
                              alt="" 
                              className="w-10 h-10 rounded-2xl object-cover border border-zinc-200 shrink-0" 
                              referrerPolicy="no-referrer" 
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                              {(u.displayName || u.email || 'U').substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-900 truncate block">
                                {u.displayName || 'Pengguna'}
                              </span>
                              {isOwner && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                                  Owner
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-zinc-400 truncate block">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Last Login */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="text-zinc-600 flex items-center gap-1.5 text-xs">
                          <Clock size={13} className="text-zinc-400 shrink-0" />
                          <span>
                            {u.lastLogin 
                              ? new Date(u.lastLogin).toLocaleString('id-ID', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short'
                                }) 
                              : '-'}
                          </span>
                        </div>
                      </td>

                      {/* Access Level Dropdown */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2.5">
                          {isOwner ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-200 text-xs font-bold shadow-sm">
                              <Crown size={14} className="text-purple-600" />
                              <span>Super Admin (Permanen)</span>
                            </div>
                          ) : (
                            <div className="relative inline-block">
                              <select
                                value={effectiveRole}
                                disabled={isUpdatingThis}
                                onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole, u)}
                                className={`appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-bold border transition focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer disabled:opacity-50 ${
                                  effectiveRole === 'super_admin'
                                    ? 'bg-purple-50 text-purple-900 border-purple-200'
                                    : effectiveRole === 'admin'
                                    ? 'bg-amber-50 text-amber-950 border-amber-200'
                                    : effectiveRole === 'viewer'
                                    ? 'bg-zinc-100 text-zinc-800 border-zinc-200'
                                    : 'bg-emerald-50 text-emerald-950 border-emerald-200'
                                }`}
                              >
                                <option value="super_admin">👑 Super Admin</option>
                                <option value="admin">⭐ Admin Bidang</option>
                                <option value="staff">💼 Staf Operator</option>
                                <option value="viewer">👁️ Viewer (Lihat Saja)</option>
                              </select>
                              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500" />
                            </div>
                          )}

                          {isUpdatingThis && (
                            <RefreshCw size={14} className="animate-spin text-yellow-600 shrink-0" />
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          u.status === 'authorized' || isOwner
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'authorized' || isOwner ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {u.status === 'authorized' || isOwner ? 'Aktif' : 'Tertunda'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        {!isOwner ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleStatusToggle(u)}
                              disabled={isUpdatingThis}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 ${
                                u.status === 'authorized'
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                              }`}
                              title={u.status === 'authorized' ? 'Cabut izin akses portal' : 'Beri izin akses masuk'}
                            >
                              {u.status === 'authorized' ? (
                                <>
                                  <UserX size={13} />
                                  <span>Cabut Akses</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck size={13} />
                                  <span>Beri Akses</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              disabled={isUpdatingThis}
                              className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Hapus Pengguna"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic font-medium">
                            Akses Penuh
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
