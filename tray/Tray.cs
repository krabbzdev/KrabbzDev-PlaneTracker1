// System tray icon for Krabbz9999 - Look A Plane!.
// Node.js can't show a tray icon, so the app carries this tiny helper inside its .exe and starts it.
// Usage: Krabbz9999-FlightTracker-Tray.exe <port> <app process id> <tooltip>
//        Krabbz9999-FlightTracker-Tray.exe --email <file> <subject>   (the app's "Email debug log": a new email with the file attached)
// Left-click or "Open Look A Plane!" opens the dashboard; "Check for updates" asks the app to look for a newer build
// on GitHub and install it; "Email debug log..." asks the app to gather its log and email it; "Quit" asks the app
// to save and exit.
// The helper closes itself as soon as the app's process is gone (including when an update restarts it).
// Build: csc /target:winexe /out:build\Krabbz9999-FlightTracker-Tray.exe tray\Tray.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Tray
{
    static NotifyIcon icon;
    static string url, api;

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length >= 3 && args[0] == "--email") { DebugEmail.Send(args[1], args[2]); return; }
        int port, appPid;
        if (args.Length < 2 || !int.TryParse(args[0], out port) || !int.TryParse(args[1], out appPid)) return;
        url = "http://localhost:" + port + "/";
        api = "http://127.0.0.1:" + port + "/"; // the app only listens on this PC's IPv4 loopback
        string tip = args.Length > 2 ? args[2] : "Krabbz9999 - Look A Plane!";

        Process app;
        try { app = Process.GetProcessById(appPid); } catch { return; } // app already gone

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Look A Plane!", null, (s, e) => Open()).Font = new Font(menu.Font, FontStyle.Bold);
        var settingsMenu = new ToolStripMenuItem("Settings");
        settingsMenu.DropDownItems.Add("(loading…)");
        settingsMenu.DropDownOpening += (s, e) => TraySettings.Build(settingsMenu, api);
        menu.Items.Add(settingsMenu);
        menu.Items.Add("Check for updates", null, (s, e) => CheckForUpdates());
        menu.Items.Add("💡 Send feedback...", null, (s, e) => { try { Process.Start(url + "#feedback"); } catch { } }); // the page opens its feedback form
        menu.Items.Add("Email debug log...", null, (s, e) => AskApp("api/debuglog"));
        menu.Items.Add("☕ Buy me a coffee", null, (s, e) => { try { Process.Start(CoffeeUrl); } catch { } });
        menu.Items.Add(new ToolStripSeparator());
        // build details, read from the app each time the menu opens; clicking opens that build on GitHub
        var buildItem = new ToolStripMenuItem("Build…") { ForeColor = SystemColors.GrayText };
        string buildUrl = null;
        buildItem.Click += (s, e) => { if (buildUrl != null) try { Process.Start(buildUrl); } catch { } };
        menu.Items.Add(buildItem);
        menu.Opening += (s, e) => { string text; buildUrl = BuildDetails(out text); buildItem.Text = text; };
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (s, e) => Quit());

        icon = new NotifyIcon
        {
            Icon = DrawIcon(),
            Text = tip.Length > 63 ? tip.Substring(0, 63) : tip, // Windows' tooltip limit
            ContextMenuStrip = menu,
            Visible = true,
        };
        icon.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) Open(); };

        var watch = new System.Windows.Forms.Timer { Interval = 2000 };
        watch.Tick += (s, e) => { if (HasExited(app)) Exit(); };
        watch.Start();

        Application.Run();
    }

    static bool HasExited(Process p)
    {
        try { return p.HasExited; } catch { return true; }
    }

    // Asks the app to open its dashboard window (the one where sound works without a click); if the app doesn't
    // answer, opens the dashboard in the default browser instead.
    static void Open()
    {
        try
        {
            using (var web = new WebClient())
            {
                web.Headers["X-FT-Tray"] = "1";
                web.UploadString(api + "api/open", "");
            }
        }
        catch
        {
            try { Process.Start(url); } catch { }
        }
    }

    // Asks the app (/api/update) to check GitHub; if there's a newer build, asks it to install it. The app then
    // restarts on the new build and this helper closes with it. The answer shows as a Windows notification.
    static void CheckForUpdates()
    {
        var ui = SynchronizationContext.Current;
        Action<string, ToolTipIcon> tell = (msg, kind) => ui.Post(_ => icon.ShowBalloonTip(5000, "Look A Plane! updates", msg, kind), null);
        tell("Checking for updates…", ToolTipIcon.Info);
        ThreadPool.QueueUserWorkItem(_ =>
        {
            try
            {
                using (var web = new WebClient())
                {
                    // the app works out whether there's a newer build ("available"); builds look like 67 or 67.2
                    var r = (System.Collections.Generic.Dictionary<string, object>)new System.Web.Script.Serialization.JavaScriptSerializer()
                        .DeserializeObject(web.UploadString(api + "api/update", "{\"check\":true}"));
                    string now = Build(r, "current"), latest = Build(r, "latest");
                    if (r.ContainsKey("available") && r["available"] is bool && (bool)r["available"])
                    {
                        web.UploadString(api + "api/update", "{\"install\":true}");
                        tell("Updating to build " + latest + ". It restarts by itself in a few seconds.", ToolTipIcon.Info);
                    }
                    else if (latest != "") tell("You're up to date (build " + now + ").", ToolTipIcon.Info);
                    else tell("Couldn't reach GitHub to check. Try again later.", ToolTipIcon.Warning);
                }
            }
            catch { tell("Couldn't check for updates right now.", ToolTipIcon.Warning); }
        });
    }

    // the build number in the app's "current" or "latest" part of its update reply ("" if missing)
    static string Build(System.Collections.Generic.Dictionary<string, object> r, string section)
    {
        object part, build;
        return r.TryGetValue(section, out part) && part is System.Collections.Generic.Dictionary<string, object>
            && ((System.Collections.Generic.Dictionary<string, object>)part).TryGetValue("build", out build) && build != null
            ? Convert.ToString(build, System.Globalization.CultureInfo.InvariantCulture) : "";
    }

    // "Build 67.2 · a1b2c3d · 2026-10-30" from the app (/api/version), and the GitHub page for that build
    static string BuildDetails(out string text)
    {
        text = "Build details unavailable";
        try
        {
            using (var web = new WebClient { Encoding = System.Text.Encoding.UTF8 })
            {
                var v = (System.Collections.Generic.Dictionary<string, object>)new System.Web.Script.Serialization.JavaScriptSerializer()
                    .DeserializeObject(web.DownloadString(api + "api/version"));
                Func<string, string> get = k => v.ContainsKey(k) && v[k] != null ? Convert.ToString(v[k], System.Globalization.CultureInfo.InvariantCulture) : "";
                string build = get("build"), commit = get("commit"), date = get("date"), repo = get("repo");
                text = "Build " + build + (commit != "" ? " · " + commit : "") + (date != "" ? " · " + date : "");
                if (repo == "") return null;
                return "https://github.com/" + repo + (commit != "" ? "/commit/" + commit : "/releases/tag/v" + get("version") + "." + build);
            }
        }
        catch { return null; }
    }

    // KrabbzDev's tip jar (the same one as the BusyLightz app).
    const string CoffeeUrl = "https://buymeacoffee.com/krabbzdev";

    // Posts to one of the app's tray-only addresses, in the background so the menu doesn't freeze.
    static void AskApp(string path)
    {
        ThreadPool.QueueUserWorkItem(_ =>
        {
            try
            {
                using (var web = new WebClient())
                {
                    web.Headers["X-FT-Tray"] = "1";
                    web.UploadString(api + path, "");
                }
            }
            catch { }
        });
    }

    static void Quit()
    {
        try
        {
            using (var web = new WebClient())
            {
                web.Headers["X-FT-Tray"] = "1"; // the app only accepts quit requests carrying this
                web.UploadString(api + "api/quit", "");
            }
        }
        catch { }
        Exit();
    }

    static void Exit()
    {
        icon.Visible = false;
        icon.Dispose();
        Application.Exit();
    }

    // A ✈ in the app's sky blue on a dark round badge, drawn at runtime so there's no .ico file to ship.
    static Icon DrawIcon()
    {
        var blue = Color.FromArgb(76, 201, 240);
        using (var bmp = new Bitmap(32, 32))
        {
            using (var g = Graphics.FromImage(bmp))
            using (var dark = new SolidBrush(Color.FromArgb(11, 16, 32)))
            using (var ring = new Pen(blue, 2))
            using (var brush = new SolidBrush(blue))
            using (var font = new Font("Segoe UI Symbol", 19, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.FillEllipse(dark, 0, 0, 31, 31);
                g.DrawEllipse(ring, 1, 1, 29, 29);
                g.DrawString("✈", font, brush, new RectangleF(0, 1, 32, 32), center);
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }
}

// "Email debug log": opens a new email in the default mail app with the app's log file attached, using Windows'
// Simple MAPI (the same way as the BusyLightz app). Classic Outlook and most desktop mail apps attach the file;
// the new Outlook and webmail can't be handed a file, so then the file is shown in its folder and a plain email
// is started to drag it into.
static class DebugEmail
{
    // Where debug logs are sent; empty leaves the To line for the user to fill in.
    static readonly string SupportEmail = "";

    public static void Send(string file, string subject)
    {
        string body = "What were you doing when the problem happened?\r\n\r\n\r\n";
        if (SendWithAttachment(subject, body, file)) return;
        try { Process.Start("explorer.exe", "/select,\"" + file + "\""); } catch { }
        try
        {
            Process.Start("mailto:" + SupportEmail + "?subject=" + Uri.EscapeDataString(subject)
                + "&body=" + Uri.EscapeDataString(body + "Please attach the log file from the folder that just opened:\r\n" + file));
        }
        catch { }
    }

    const int MAPI_LOGON_UI = 0x1, MAPI_DIALOG = 0x8, MAPI_TO = 1, SUCCESS_SUCCESS = 0, MAPI_USER_ABORT = 1;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    class MapiMessage
    {
        public int Reserved;
        public string Subject, NoteText, MessageType, DateReceived, ConversationId;
        public int Flags;
        public IntPtr Originator;
        public int RecipCount;
        public IntPtr Recips;
        public int FileCount;
        public IntPtr Files;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    struct MapiFileDesc
    {
        public int Reserved, Flags, Position;
        public string PathName, FileName;
        public IntPtr FileType;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    struct MapiRecipDesc
    {
        public int Reserved, RecipClass;
        public string Name, Address;
        public int EntryIdSize;
        public IntPtr EntryId;
    }

    [DllImport("MAPI32.DLL", CharSet = CharSet.Ansi)]
    static extern int MAPISendMail(IntPtr session, IntPtr hwnd, MapiMessage message, int flags, int reserved);

    // True if the mail app's new-email window opened (even if the user then cancelled); false if there's no
    // mail app that takes Simple MAPI.
    static bool SendWithAttachment(string subject, string body, string file)
    {
        var attachment = new MapiFileDesc { Position = -1, PathName = file, FileName = Path.GetFileName(file) };
        IntPtr files = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(MapiFileDesc)));
        IntPtr recips = IntPtr.Zero;
        try
        {
            Marshal.StructureToPtr(attachment, files, false);
            var message = new MapiMessage { Subject = subject, NoteText = body, FileCount = 1, Files = files };
            if (SupportEmail != "")
            {
                var to = new MapiRecipDesc { RecipClass = MAPI_TO, Name = SupportEmail, Address = "SMTP:" + SupportEmail };
                recips = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(MapiRecipDesc)));
                Marshal.StructureToPtr(to, recips, false);
                message.RecipCount = 1;
                message.Recips = recips;
            }
            int result = MAPISendMail(IntPtr.Zero, IntPtr.Zero, message, MAPI_LOGON_UI | MAPI_DIALOG, 0);
            return result == SUCCESS_SUCCESS || result == MAPI_USER_ABORT;
        }
        catch (Exception) { return false; } // no MAPI32.DLL, or it couldn't be loaded
        finally
        {
            Marshal.DestroyStructure(files, typeof(MapiFileDesc));
            Marshal.FreeHGlobal(files);
            if (recips != IntPtr.Zero)
            {
                Marshal.DestroyStructure(recips, typeof(MapiRecipDesc));
                Marshal.FreeHGlobal(recips);
            }
        }
    }
}

// The Settings menu: every setting the app lists (the dashboard's and the app's own), grouped as on the page.
// Rebuilt each time it's opened, so new settings in the app show up here without changing this helper.
// On/off settings are ticks, choices are pick lists, sliders offer a few values across their range.
static class TraySettings
{
    static readonly System.Web.Script.Serialization.JavaScriptSerializer Json = new System.Web.Script.Serialization.JavaScriptSerializer();

    public static void Build(ToolStripMenuItem root, string api)
    {
        root.DropDownItems.Clear();
        object[] prefs;
        try
        {
            using (var web = new WebClient { Encoding = System.Text.Encoding.UTF8 })
                prefs = (object[])((System.Collections.Generic.Dictionary<string, object>)Json.DeserializeObject(web.DownloadString(api + "api/prefs")))["prefs"];
        }
        catch { root.DropDownItems.Add(new ToolStripMenuItem("Couldn't reach the app") { Enabled = false }); return; }
        if (prefs.Length <= 3) root.DropDownItems.Add(new ToolStripMenuItem("Open the dashboard once to list all its settings") { Enabled = false });

        var groups = new System.Collections.Generic.Dictionary<string, ToolStripMenuItem>();
        foreach (System.Collections.Generic.Dictionary<string, object> p in prefs)
        {
            string group = Str(p, "group"), key = Str(p, "key"), label = Str(p, "label"), type = Str(p, "type");
            ToolStripMenuItem g;
            if (!groups.TryGetValue(group, out g)) { g = new ToolStripMenuItem(group); groups[group] = g; root.DropDownItems.Add(g); }
            object value; p.TryGetValue("value", out value);

            if (type == "bool")
            {
                bool on = value is bool && (bool)value;
                g.DropDownItems.Add(new ToolStripMenuItem(label, null, (s, e) => Set(api, key, !on)) { Checked = on });
            }
            else if (type == "choice" && p.ContainsKey("options") && p["options"] is object[])
            {
                var sub = new ToolStripMenuItem(label);
                foreach (object[] o in (object[])p["options"])
                {
                    string v = Convert.ToString(o[0]), text = Convert.ToString(o[1]);
                    sub.DropDownItems.Add(new ToolStripMenuItem(text, null, (s, e) => Set(api, key, v)) { Checked = v == Convert.ToString(value) });
                }
                g.DropDownItems.Add(sub);
            }
            else if (type == "range")
            {
                double min = Num(p, "min"), max = Num(p, "max"), step = Num(p, "step"), scale = Num(p, "scale"), now = value == null ? double.NaN : Convert.ToDouble(value);
                if (step <= 0) step = 1;
                if (scale == 0) scale = 1;
                string unit = Str(p, "unit");
                var sub = new ToolStripMenuItem(label + (double.IsNaN(now) ? "" : ": " + Show(now * scale) + unit));
                var values = new System.Collections.Generic.SortedSet<double>();
                for (int i = 0; i <= 4; i++) values.Add(Math.Round((min + (max - min) * i / 4) / step) * step); // five steps across the range
                if (!double.IsNaN(now)) values.Add(now);
                foreach (double v in values)
                {
                    double val = v;
                    sub.DropDownItems.Add(new ToolStripMenuItem(Show(val * scale) + unit, null, (s, e) => Set(api, key, val)) { Checked = Math.Abs(val - now) < step / 2 });
                }
                g.DropDownItems.Add(sub);
            }
        }
    }

    static string Str(System.Collections.Generic.Dictionary<string, object> p, string k) { object v; return p.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : ""; }
    static double Num(System.Collections.Generic.Dictionary<string, object> p, string k) { object v; return p.TryGetValue(k, out v) && v != null ? Convert.ToDouble(v) : 0; }
    static string Show(double v) { return Math.Round(v, 2).ToString(System.Globalization.CultureInfo.InvariantCulture); }

    static void Set(string api, string key, object value)
    {
        string body = Json.Serialize(new System.Collections.Generic.Dictionary<string, object> { { "key", key }, { "value", value } });
        System.Threading.ThreadPool.QueueUserWorkItem(_ =>
        {
            try
            {
                using (var web = new WebClient())
                {
                    web.Headers["Content-Type"] = "application/json";
                    web.UploadString(api + "api/prefs/set", body);
                }
            }
            catch { }
        });
    }
}
