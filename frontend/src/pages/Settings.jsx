import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

const NotificationCard = ({ icon, gradient, title, description, enabled, onToggle, children }) => (
    <div className="bg-[#0a0a0f] border border-gray-800/50 rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-5">
            <div className={`w-12 h-12 rounded-xl ${gradient} flex items-center justify-center text-xl shrink-0`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" checked={enabled} onChange={onToggle} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
        </div>
        {enabled && children && <div className="pl-16">{children}</div>}
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
                notificationPreferences: user.notificationPreferences || { email: true, slack: false, sms: false, webhook: false },
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
            setFormData({ ...formData, contactEmails: result.user.contactEmails || [] });
            // Auto-dismiss success message after 3 seconds
            setTimeout(() => setMessage(''), 3000);
        } else {
            setMessage(result.error || 'Failed to save settings');
        }
        setSaving(false);
    };

    const addContactEmail = async () => {
        setContactEmailMessage('');
        const email = (newContactEmail || '').trim();
        if (!email) { setContactEmailMessage('Please enter an email address.'); return; }
        if (!/^\S+@\S+\.\S+$/.test(email)) { setContactEmailMessage('Please enter a valid email address'); return; }
        try {
            const res = await authAPI.checkEmail(email);
            if (res.data?.exists) {
                const list = [...(formData.contactEmails || [])];
                if (!list.includes(email)) {
                    list.push(email);
                    const result = await updateProfile({ ...formData, contactEmails: list });
                    if (result.success) {
                        setContactEmailMessage('Email added successfully!');
                        setNewContactEmail('');
                        setFormData({ ...formData, contactEmails: result.user.contactEmails || [] });
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
        const list = formData.contactEmails.filter(x => x !== email);
        const result = await updateProfile({ ...formData, contactEmails: list });
        if (result.success) {
            setContactEmailMessage('Email removed.');
            setFormData({ ...formData, contactEmails: result.user.contactEmails || [] });
            setTimeout(() => setContactEmailMessage(''), 3000);
        }
    };

    const updatePref = (key, value) => {
        setFormData({ ...formData, notificationPreferences: { ...formData.notificationPreferences, [key]: value } });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Notifications</h1>
                <p className="text-gray-500 mt-1">Configure how you receive alerts and notifications</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <NotificationCard icon="📧" gradient="bg-gradient-to-br from-indigo-500 to-purple-500" title="Email Notifications"
                    description="Receive alerts via email when monitors go down or recover"
                    enabled={formData.notificationPreferences.email}
                    onToggle={(e) => updatePref('email', e.target.checked)}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Add Email for Alerts</label>
                            <div className="flex gap-2">
                                <input type="email" placeholder="add@example.com" value={newContactEmail}
                                    onChange={(e) => { setNewContactEmail(e.target.value); setContactEmailMessage(''); }}
                                    className="flex-1 px-4 py-2.5 bg-[#12121a] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 outline-none" />
                                <button type="button" onClick={addContactEmail}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors">
                                    Add
                                </button>
                            </div>
                            {contactEmailMessage && (
                                <p className={`mt-2 text-sm ${contactEmailMessage.includes('success') || contactEmailMessage.includes('added') ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {contactEmailMessage}
                                </p>
                            )}
                        </div>
                        {formData.contactEmails?.length > 0 && (
                            <div className="space-y-2">
                                {formData.contactEmails.map(email => (
                                    <div key={email} className="flex items-center justify-between p-3 bg-[#12121a] border border-gray-800/50 rounded-xl">
                                        <span className="text-white text-sm">{email}</span>
                                        <button type="button" onClick={() => removeContactEmail(email)}
                                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded-lg transition-colors">
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </NotificationCard>

                {/* Slack */}
                <NotificationCard icon="💬" gradient="bg-gradient-to-br from-purple-600 to-pink-500" title="Slack Notifications"
                    description="Send alerts to your Slack workspace via webhooks"
                    enabled={formData.notificationPreferences.slack}
                    onToggle={(e) => updatePref('slack', e.target.checked)}>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Slack Webhook URL</label>
                        <input type="url" placeholder="https://hooks.slack.com/services/..."
                            value={formData.slackWebhook} onChange={(e) => setFormData({ ...formData, slackWebhook: e.target.value })}
                            className="w-full px-4 py-2.5 bg-[#12121a] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 outline-none" />
                        <p className="mt-2 text-xs text-gray-600">Create a webhook in Slack and paste the URL here</p>
                    </div>
                </NotificationCard>

                {/* SMS */}
                <NotificationCard icon="📱" gradient="bg-gradient-to-br from-amber-500 to-orange-500" title="SMS Notifications"
                    description="Receive alerts via SMS to your mobile phone"
                    enabled={formData.notificationPreferences.sms}
                    onToggle={(e) => updatePref('sms', e.target.checked)}>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Phone Number</label>
                        <input type="tel" placeholder="+1234567890"
                            value={formData.phoneNumber} onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                            className="w-full px-4 py-2.5 bg-[#12121a] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 outline-none" />
                        <p className="mt-2 text-xs text-gray-600">Enter your phone number with country code</p>
                    </div>
                </NotificationCard>

                {/* Webhook */}
                <NotificationCard icon="🔗" gradient="bg-gradient-to-br from-emerald-500 to-teal-500" title="Webhook Notifications"
                    description="Send alerts to external services via HTTP webhooks"
                    enabled={formData.notificationPreferences.webhook}
                    onToggle={(e) => updatePref('webhook', e.target.checked)}>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Webhook URL</label>
                        <input type="url" placeholder="https://your-webhook-url.com"
                            value={formData.webhookUrl} onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                            className="w-full px-4 py-2.5 bg-[#12121a] border border-gray-800 rounded-xl text-white placeholder-gray-600 focus:border-indigo-500 outline-none" />
                        <p className="mt-2 text-xs text-gray-600">We'll send POST requests with alert data to this URL</p>
                    </div>
                </NotificationCard>

                {message && (
                    <div className={`p-4 rounded-xl text-sm ${message.includes('success') ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                        {message}
                    </div>
                )}

                <button type="submit" disabled={saving}
                    className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20">
                    {saving ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Saving...
                        </span>
                    ) : 'Save Notification Settings'}
                </button>
            </form>
        </div>
    );
};

export default Settings;
