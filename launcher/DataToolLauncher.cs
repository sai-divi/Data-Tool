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

        [STAThread]
        private static void Main()
        {
            string appDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (String.IsNullOrEmpty(appDir))
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
                if (String.IsNullOrEmpty(nodePath))
                {
                    ShowError("Node.js was not found. Install Node.js, or keep node.exe in a runtime folder next to Data Tool.exe.");
                    return;
                }

                StartServer(appDir, nodePath);
                WaitForServer();
            }

            OpenBrowser();
        }

        private static string FindNode(string appDir)
        {
            string localNode = Path.Combine(appDir, "runtime", "node.exe");
            if (File.Exists(localNode)) return localNode;

            string envNode = Environment.GetEnvironmentVariable("DATA_TOOL_NODE");
            if (!String.IsNullOrWhiteSpace(envNode) && File.Exists(envNode)) return envNode;

            string codexNode = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OpenAI",
                "Codex",
                "bin",
                "node.exe"
            );
            if (File.Exists(codexNode)) return codexNode;

            string programFilesNode = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "nodejs",
                "node.exe"
            );
            if (File.Exists(programFilesNode)) return programFilesNode;

            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string entry in path.Split(Path.PathSeparator))
            {
                try
                {
                    string candidate = Path.Combine(entry.Trim(), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch
                {
                    // Ignore invalid PATH entries.
                }
            }

            return null;
        }

        private static void StartServer(string appDir, string nodePath)
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = nodePath;
            info.Arguments = "\"" + ServerFile + "\"";
            info.WorkingDirectory = appDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;

            Process.Start(info);
        }

        private static bool WaitForServer()
        {
            for (int i = 0; i < 40; i++)
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

        private static void OpenBrowser()
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = AppUrl;
            info.UseShellExecute = true;
            Process.Start(info);
        }

        private static void ShowError(string message)
        {
            MessageBox.Show(message, "Data Tool", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
