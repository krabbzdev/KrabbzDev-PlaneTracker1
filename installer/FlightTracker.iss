; Installer for Krabbz9999 - FlightTracker (Inno Setup 6, https://jrsoftware.org/isinfo.php).
; Installs for the current user WITHOUT admin rights, into C:\Users\Public\Apps\Krabbz9999-FlightTracker.
; Built by GitHub Actions on every release (.github/workflows/release.yml):
;   ISCC.exe /DAppVersion=1.0.44 installer\FlightTracker.iss   ->   dist\Krabbz9999-FlightTracker-Setup.exe
; The app keeps its settings and data next to the .exe, which is why it goes in a folder the user can write to,
; and it updates itself in place from GitHub Releases after that.

#define AppName "Krabbz9999 - FlightTracker"
#define AppExe "Krabbz9999-FlightTracker.exe"
#define TrayExe "Krabbz9999-FlightTracker-Tray.exe"
#ifndef AppVersion
  #define AppVersion "1.0"
#endif

[Setup]
AppId={{E2A74E37-D4A9-45B6-8BF0-E53E078A78CA}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Krabbz9999
AppPublisherURL=https://flighttracker.loves3d.com
AppSupportURL=https://github.com/krabbzdev/krabbz9999-flighttracker/wiki
AppUpdatesURL=https://github.com/krabbzdev/krabbz9999-flighttracker/releases
; no admin: installs for this user only, into the shared Public folder (writable without admin)
PrivilegesRequired=lowest
DefaultDirName={%PUBLIC|C:\Users\Public}\Apps\Krabbz9999-FlightTracker
DisableDirPage=auto
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
OutputDir=..\dist
OutputBaseFilename=Krabbz9999-FlightTracker-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; close a running copy before replacing it (the tray helper is closed by the app as it exits)
CloseApplications=force
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
Name: "startup"; Description: "Start FlightTracker when I sign in to Windows (runs in the tray)"; Flags: unchecked

[Files]
Source: "..\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon
; --background: start quietly in the tray without opening the browser
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--background"; WorkingDir: "{app}"; Tasks: startup

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName} now"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; stop the app and its tray icon so their files can be removed: only the ones running FROM THIS FOLDER
; (matching by name alone would also close a separate copy running somewhere else)
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""Get-Process -Name 'Krabbz9999-FlightTracker','Krabbz9999-FlightTracker-Tray' -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -like '{app}\*' } | Stop-Process -Force"""; Flags: runhidden waituntilterminated; RunOnceId: "StopApp"

[UninstallDelete]
; files the app creates itself. Your settings, daily log, cruise sightings and FAA data are left in place,
; so reinstalling picks up where you left off; delete the folder to remove them too.
Type: files; Name: "{app}\{#TrayExe}"
Type: files; Name: "{app}\{#AppExe}.old"
Type: files; Name: "{app}\{#AppExe}.new"
Type: files; Name: "{app}\airports-cache.json"
Type: files; Name: "{app}\aircraft-types-cache.json"
Type: files; Name: "{app}\cruise-fleet.json"
