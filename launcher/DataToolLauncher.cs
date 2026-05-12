using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace DataToolLauncher
{
    internal static class Program
    {
        private const string AppUrl = "http://localhost:4173";
        private const string ServerFile = "server.js";
        private static Process ServerProcess;
        private static NotifyIcon TrayIcon;
        private static bool ServerStartedByUs;

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (string.IsNullOrEmpty(appDir))
            {
                ShowError("Could not find the application folder.");
                return;
            }

            string serverPath = Path.Combine(appDir, ServerFile);
            if (!File.Exists(serverPath))
            {
                ShowError("Missing server.js. Keep Data Tool.exe in the same folder as server.js and the public folder.");
                return;
            }

            if (!IsServerReady())
            {
                string nodePath = FindNode(appDir);
                if (string.IsNullOrEmpty(nodePath))
                {
                    ShowError("Node.js was not found. Install Node.js, or keep node.exe in a runtime folder next to Data Tool.exe.");
                    return;
                }

                StartServer(appDir, nodePath);
                if (!WaitForServer())
                {
                    ShowError("Server failed to start. Check that port 4173 is available.");
                    return;
                }
                ServerStartedByUs = true;
            }

            TrayIcon = new NotifyIcon
            {
                Text = "Data Tool",
                Visible = true
            };

            try
            {
                TrayIcon.Icon = System.Drawing.Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
            }
            catch
            {
                // Continue without custom icon
            }

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open Data Tool", null, (s, e) => OpenApp());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, (s, e) => ExitApp());
            TrayIcon.ContextMenuStrip = menu;
            TrayIcon.DoubleClick += (s, e) => OpenApp();

            OpenApp();
            Application.Run();
        }

        private static void OpenApp()
        {
            try
            {
                string edge = FindBrowser("msedge.exe");
                if (!string.IsNullOrEmpty(edge))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edge,
                        Arguments = "--app=" + AppUrl + " --window-size=1280,800",
                        UseShellExecute = false
                    });
                    return;
                }
            }
            catch
            {
                // Fallback
            }

            try
            {
                Process.Start(new ProcessStartInfo { FileName = AppUrl, UseShellExecute = true });
            }
            catch
            {
                // Silent fail
            }
        }

        private static void ExitApp()
        {
            TrayIcon.Visible = false;
            TrayIcon.Dispose();

            if (ServerStartedByUs && ServerProcess != null && !ServerProcess.HasExited)
            {
                try
                {
                    ServerProcess.Kill();
                    ServerProcess.WaitForExit(5000);
                }
                catch
                {
                    // Process already exited
                }
            }

            Application.Exit();
        }

        private static string FindNode(string appDir)
        {
            string localNode = Path.Combine(appDir, "runtime", "node.exe");
            if (File.Exists(localNode)) return localNode;

            string envNode = Environment.GetEnvironmentVariable("DATA_TOOL_NODE");
            if (!string.IsNullOrWhiteSpace(envNode) && File.Exists(envNode)) return envNode;

            string codexNode = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OpenAI", "Codex", "bin", "node.exe");
            if (File.Exists(codexNode)) return codexNode;

            string programFilesNode = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "nodejs", "node.exe");
            if (File.Exists(programFilesNode)) return programFilesNode;

            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string entry in path.Split(Path.PathSeparator))
            {
                try
                {
                    string candidate = Path.Combine(entry.Trim(), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }

            return null;
        }

        private static string FindBrowser(string name)
        {
            string[] searchPaths = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application")
            };

            foreach (string dir in searchPaths)
            {
                try
                {
                    string full = Path.Combine(dir, name);
                    if (File.Exists(full)) return full;
                }
                catch { }
            }

            foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            {
                try
                {
                    string full = Path.Combine(entry.Trim(), name);
                    if (File.Exists(full)) return full;
                }
                catch { }
            }

            return null;
        }

        private static void StartServer(string appDir, string nodePath)
        {
            ProcessStartInfo info = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "\"" + ServerFile + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            ServerProcess = Process.Start(info);
        }

        private static bool WaitForServer()
        {
            for (int i = 0; i < 60; i++)
            {
                if (IsServerReady()) return true;
                Thread.Sleep(250);
            }
            return false;
        }

        private static bool IsServerReady()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(AppUrl);
                request.Method = "GET";
                request.Timeout = 700;

                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode >= 200 && (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void ShowError(string message)
        {
            MessageBox.Show(message, "Data Tool", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
