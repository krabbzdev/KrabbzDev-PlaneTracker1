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
        menu.Items.Add("Check for updates", null, (s, e) => CheckForUpdates());
        menu.Items.Add("Email debug log...", null, (s, e) => AskApp("api/debuglog"));
        menu.Items.Add("☕ Buy me a coffee", null, (s, e) => { try { Process.Start(CoffeeUrl); } catch { } });
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
                    string r = web.UploadString(api + "api/update", "{\"check\":true}");
                    int now = Build(r, "current"), latest = Build(r, "latest");
                    if (latest > now)
                    {
                        web.UploadString(api + "api/update", "{\"install\":true}");
                        tell("Updating to build " + latest + ". It restarts by itself in a few seconds.", ToolTipIcon.Info);
                    }
                    else if (latest > 0) tell("You're up to date (build " + now + ").", ToolTipIcon.Info);
                    else tell("Couldn't reach GitHub to check. Try again later.", ToolTipIcon.Warning);
                }
            }
            catch { tell("Couldn't check for updates right now.", ToolTipIcon.Warning); }
        });
    }

    // "build":N inside the app's "current" or "latest" section of its update reply (0 if missing)
    static int Build(string json, string section)
    {
        var m = Regex.Match(json, "\"" + section + "\"\\s*:\\s*\\{[^}]*?\"build\"\\s*:\\s*(\\d+)");
        return m.Success ? int.Parse(m.Groups[1].Value) : 0;
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
