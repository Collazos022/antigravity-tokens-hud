using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("Antigravity Tokens HUD")]
[assembly: AssemblyDescription("Monitor en tiempo real de tokens y cuotas para Antigravity 2.0")]
[assembly: AssemblyCompany("Collazos022")]
[assembly: AssemblyProduct("Antigravity Tokens HUD")]
[assembly: AssemblyVersion("1.1.1.0")]
[assembly: AssemblyFileVersion("1.1.1.0")]

namespace AntigravityTokensHud
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string indexJs = Path.Combine(appDir, "index.js");

            if (!File.Exists(indexJs))
            {
                // Fallback to user profile if running from elsewhere
                string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                indexJs = Path.Combine(home, ".antigravity-tokens-hud", "index.js");
                appDir = Path.Combine(home, ".antigravity-tokens-hud");
            }

            if (!File.Exists(indexJs)) return;

            string nodeExe = FindNodeExecutable();
            if (string.IsNullOrEmpty(nodeExe)) return;

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodeExe;
            psi.Arguments = "\"" + indexJs + "\"";
            psi.WorkingDirectory = appDir;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;

            try
            {
                Process.Start(psi);
            }
            catch { }
        }

        static string FindNodeExecutable()
        {
            string[] directPaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "node", "node.exe")
            };

            foreach (string p in directPaths)
            {
                if (File.Exists(p)) return p;
            }

            // Fallback to system PATH
            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in pathEnv.Split(';'))
            {
                string trimmed = dir.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;
                string candidate = Path.Combine(trimmed, "node.exe");
                if (File.Exists(candidate)) return candidate;
            }

            return "node.exe";
        }
    }
}
