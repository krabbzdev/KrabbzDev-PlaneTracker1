// System tray icon for Krabbz9999 - FlightTracker.
// Node.js can't show a tray icon, so the app carries this tiny helper inside its .exe and starts it.
// Usage: Krabbz9999-FlightTracker-Tray.exe <port> <app process id> <tooltip>
// Left-click or "Open FlightTracker" opens the dashboard; "Quit" asks the app to save and exit.
// The helper closes itself as soon as the app's process is gone (including when an update restarts it).
// Build: csc /target:winexe /out:build\Krabbz9999-FlightTracker-Tray.exe tray\Tray.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Net;
using System.Windows.Forms;

static class Tray
{
    static NotifyIcon icon;
    static string url;

    [STAThread]
    static void Main(string[] args)
    {
        int port, appPid;
        if (args.Length < 2 || !int.TryParse(args[0], out port) || !int.TryParse(args[1], out appPid)) return;
        url = "http://localhost:" + port + "/";
        string tip = args.Length > 2 ? args[2] : "Krabbz9999 - FlightTracker";

        Process app;
        try { app = Process.GetProcessById(appPid); } catch { return; } // app already gone

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open FlightTracker", null, (s, e) => Open()).Font = new Font(menu.Font, FontStyle.Bold);
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

        var watch = new Timer { Interval = 2000 };
        watch.Tick += (s, e) => { if (HasExited(app)) Exit(); };
        watch.Start();

        Application.Run();
    }

    static bool HasExited(Process p)
    {
        try { return p.HasExited; } catch { return true; }
    }

    static void Open()
    {
        try { Process.Start(url); } catch { }
    }

    static void Quit()
    {
        try
        {
            using (var web = new WebClient())
            {
                web.Headers["X-FT-Tray"] = "1"; // the app only accepts quit requests carrying this
                web.UploadString(url + "api/quit", "");
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
