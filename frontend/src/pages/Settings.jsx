import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import Toast from '../components/Toast';

// Professional SVG Icons for Alert Channels
const Icons = {
    email: (
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
    ),
    slack: (
        <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
        </svg>
    ),
    sms: (
        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
    ),
    webhook: (
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
    )
};

const NotificationCard = ({ icon, iconBg, title, description, enabled, onToggle, children }) => (
    <div className="bg-[#12121a]/90 backdrop-blur-md border border-gray-800/80 rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:border-gray-700/80">
        <div className="flex items-start gap-4 mb-4">
            <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0 border border-white/5`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white font-heading">{title}</h3>
                    {enabled && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                            Active
                        </span>
                    )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" checked={enabled} onChange={onToggle} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 border border-gray-700"></div>
            </label>
        </div>
        {enabled && children && (
            <div className="pt-4 border-t border-gray-800/50">
                {children}
            </div>
        )}
    </div>
);

const Settings = () => {
    const { user, updateProfile } = useAuth();
    const [formData, setFormData] = useState({
        slackWebhook: '', phoneNumber: '', webhookUrl: '',
        notificationPreferences: { email: true, slack: false, sms: false, webhook: false },
        contactEmails: []
    });
    const [newContactEmail, setNewContactEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [contactEmailMessage, setContactEmailMessage] = useState('');

    useEffect(() => {
        if (user) {
            setFormData({
                slackWebhook: user.slackWebhook || '',
                phoneNumber: user.phoneNumber || '',
                webhookUrl: user.webhookUrl || '',
                notificationPreferences: {
                    email: true,
                    slack: false,
                    sms: false,
                    webhook: false,
                    ...(user.notificationPreferences || {})
                },
                contactEmails: user.contactEmails || []
            });
        }
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        setContactEmailMessage('');
        const result = await updateProfile({ ...formData, contactEmails: formData.contactEmails || [] });
        if (result.success) {
            setMessage('Settings saved successfully!');
            setFormData({ ...formData, contactEmails: result.user?.contactEmails || [] });
            setTimeout(() => setMessage(''), 3000);
        } else {
            setMessage(result.error || 'Failed to save settings');
            setTimeout(() => setMessage(''), 3000);
        }
        setSaving(false);
    };

    const addContactEmail = async () => {
        setContactEmailMessage('');
        const email = (newContactEmail || '').trim().toLowerCase();
        if (!email) { setContactEmailMessage('Please enter an email address.'); return; }
        if (!/^\S+@\S+\.\S+$/.test(email)) { setContactEmailMessage('Please enter a valid email address'); return; }
        try {
            const res = await authAPI.checkEmail(email);
            if (res.data?.exists) {
                const list = [...(formData.contactEmails || [])];
                const normalizedList = list.map(e => e.trim().toLowerCase());
                if (!normalizedList.includes(email)) {
                    list.push(email);
                    const result = await updateProfile({ ...formData, contactEmails: list });
                    if (result.success) {
                        setContactEmailMessage('Email added successfully!');
                        setNewContactEmail('');
                        setFormData({ ...formData, contactEmails: result.user?.contactEmails || [] });
                        setTimeout(() => setContactEmailMessage(''), 3000);
                    } else {
                        setContactEmailMessage(result.error || 'Failed to add email.');
                    }
                } else {
                    setContactEmailMessage('Email is already in the list.');
                }
            } else {
                setContactEmailMessage('Please add a registered email ID.');
            }
        } catch {
            setContactEmailMessage('Unable to verify email — try again later');
        }
    };

    const removeContactEmail = async (email) => {
        const target = (email || '').trim().toLowerCase();
        const list = (formData.contactEmails || []).filter(x => (x || '').trim().toLowerCase() !== target);
        const result = await updateProfile({ ...formData, contactEmails: list });
        if (result.success) {
            setContactEmailMessage('Email removed.');
            setFormData({ ...formData, contactEmails: result.user?.contactEmails || [] });
            setTimeout(() => setContactEmailMessage(''), 3000);
        }
    };

    const updatePref = (key, value) => {
        setFormData({ ...formData, notificationPreferences: { ...formData.notificationPreferences, [key]: value } });
    };

    return (
        <div className="space-y-6">

            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white font-heading">Settings & Alerts</h1>
                <p className="text-gray-400 text-xs sm:text-sm mt-1">Configure multi-channel notifications to receive instant downtime and recovery alerts</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Channel */}
                <NotificationCard
                    icon={Icons.email}
                    iconBg="bg-blue-500/10"
                    title="Email Notifications"
                    description="Receive automated downtime alerts and recovery confirmations via email"
                    enabled={formData.notificationPreferences.email}
                    onToggle={(e) => updatePref('email', e.target.checked)}
                >
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Additional Alert Recipients</label>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    placeholder="alert-recipient@example.com"
                                    value={newContactEmail}
                                    onChange={(e) => { setNewContactEmail(e.target.value); setContactEmailMessage(''); }}
                                    className="flex-1 px-3.5 py-2.5 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={addContactEmail}
                                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm shadow-blue-500/20 transition-all cursor-pointer shrink-0"
                                >
                                    Add Email
                                </button>
                            </div>
                            {contactEmailMessage && (
                                <p className={`mt-2 text-xs font-medium ${contactEmailMessage.includes('success') || contactEmailMessage.includes('added') ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {contactEmailMessage}
                                </p>
                            )}
                        </div>

                        {formData.contactEmails?.length > 0 && (
                            <div className="space-y-2 pt-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Configured Forwarding Emails</span>
                                {formData.contactEmails.map(email => (
                                    <div key={email} className="flex items-center justify-between p-2.5 bg-[#0a0a0f] border border-gray-800 rounded-xl">
                                        <span className="text-gray-200 text-xs font-mono truncate">{email}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeContactEmail(email)}
                                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-semibold rounded-lg border border-red-500/20 transition-colors cursor-pointer"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </NotificationCard>

                {/* Slack Channel */}
                <NotificationCard
                    icon={Icons.slack}
                    iconBg="bg-emerald-500/10"
                    title="Slack Notifications"
                    description="Forward critical alerts directly into your team's Slack incident channel"
                    enabled={formData.notificationPreferences.slack}
                    onToggle={(e) => updatePref('slack', e.target.checked)}
                >
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Slack Incoming Webhook URL</label>
                        <input
                            type="url"
                            placeholder="https://hooks.slack.com/services/..."
                            value={formData.slackWebhook}
                            onChange={(e) => setFormData({ ...formData, slackWebhook: e.target.value })}
                            className="w-full px-3.5 py-2.5 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono"
                        />
                        <p className="mt-1.5 text-[11px] text-gray-500">Create an incoming webhook in your Slack App and paste the URL above.</p>
                    </div>
                </NotificationCard>

                {/* SMS Channel */}
                <NotificationCard
                    icon={Icons.sms}
                    iconBg="bg-amber-500/10"
                    title="SMS Notifications"
                    description="Receive urgent SMS text alerts on your mobile device for critical downtime"
                    enabled={formData.notificationPreferences.sms}
                    onToggle={(e) => updatePref('sms', e.target.checked)}
                >
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Mobile Phone Number</label>
                        <input
                            type="tel"
                            placeholder="+1234567890"
                            value={formData.phoneNumber}
                            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                            className="w-full px-3.5 py-2.5 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono"
                        />
                        <p className="mt-1.5 text-[11px] text-gray-500">Enter your full mobile number including international country code (e.g. +1, +44, +91).</p>
                    </div>
                </NotificationCard>

                {/* Webhook Channel */}
                <NotificationCard
                    icon={Icons.webhook}
                    iconBg="bg-blue-500/10"
                    title="Custom Webhook"
                    description="Send raw JSON telemetry payloads to your internal servers or custom API"
                    enabled={formData.notificationPreferences.webhook}
                    onToggle={(e) => updatePref('webhook', e.target.checked)}
                >
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5">HTTP Webhook Endpoint</label>
                        <input
                            type="url"
                            placeholder="https://api.yourdomain.com/webhooks/pulseguard"
                            value={formData.webhookUrl}
                            onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                            className="w-full px-3.5 py-2.5 bg-[#0a0a0f] border border-gray-800 rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono"
                        />
                        <p className="mt-1.5 text-[11px] text-gray-500">PulseGuard will dispatch automated HTTP POST requests with incident event data.</p>
                    </div>
                </NotificationCard>

                {/* Bottom Center Modern Toast Notification */}
                <Toast message={message} onClose={() => setMessage('')} />


                <div className="flex items-center justify-end pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-500/20 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                        {saving ? (
                            <span className="flex items-center gap-1.5">
                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Saving Settings...</span>
                            </span>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Save Notification Settings</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Settings;

