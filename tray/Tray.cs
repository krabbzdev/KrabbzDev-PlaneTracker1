// System tray icon for Krabbz9999 - Look A Plane!.
// Node.js can't show a tray icon, so the app carries this tiny helper inside its .exe and starts it.
// Usage: Krabbz9999-FlightTracker-Tray.exe <port> <app process id> <tooltip>
// Left-click or "Open Look A Plane!" opens the dashboard; "Check for updates" asks the app to look for a newer build
// on GitHub and install it; "Quit" asks the app to save and exit.
// The helper closes itself as soon as the app's process is gone (including when an update restarts it).
// Build: csc /target:winexe /out:build\Krabbz9999-FlightTracker-Tray.exe tray\Tray.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Net;
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
