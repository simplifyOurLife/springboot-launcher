using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace SpringBootLauncher {
  // 明确使用 Unicode 接口，避免系统 ANSI 代码页损坏中文目录。
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count, IntPtr data, uint flags);
    void GetIDList(out IntPtr id);
    void SetIDList(IntPtr id);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int count);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int count);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
    void GetHotkey(out short key);
    void SetHotkey(short key);
    void GetShowCmd(out int command);
    void SetShowCmd(int command);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
  }
  public sealed class ShortcutDetails {
    public string TargetPath;
    public string Arguments;
    public string WorkingDirectory;
    public string IconLocation;
  }
  public static class ShortcutShell {
    private static IShellLinkW OpenLink() {
      return (IShellLinkW)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
    }
    public static ShortcutDetails Read(string filename) {
      IShellLinkW link=OpenLink();
      try {
        ((IPersistFile)link).Load(filename,0);
        StringBuilder target=new StringBuilder(32768),args=new StringBuilder(32768),directory=new StringBuilder(32768),icon=new StringBuilder(32768);
        int index;
        link.GetPath(target,target.Capacity,IntPtr.Zero,0);
        link.GetArguments(args,args.Capacity);
        link.GetWorkingDirectory(directory,directory.Capacity);
        link.GetIconLocation(icon,icon.Capacity,out index);
        return new ShortcutDetails {TargetPath=target.ToString(),Arguments=args.ToString(),WorkingDirectory=directory.ToString(),IconLocation=icon.ToString()+","+index};
      } finally { Marshal.FinalReleaseComObject(link); }
    }
    public static void Create(string filename,string target,string args,string directory,string icon) {
      IShellLinkW link=OpenLink();
      try {
        link.SetPath(target);link.SetArguments(args);link.SetWorkingDirectory(directory);
        link.SetDescription("打开 Spring Boot 服务管理与日志面板");link.SetIconLocation(icon,0);link.SetShowCmd(7);
        ((IPersistFile)link).Save(filename,true);
      } finally { Marshal.FinalReleaseComObject(link); }
      ShortcutDetails saved=Read(filename);
      if(!String.Equals(saved.IconLocation,icon+",0",StringComparison.OrdinalIgnoreCase)||saved.Arguments!=args)
        throw new InvalidOperationException("快捷方式的 Unicode 写入校验失败");
    }
    [DllImport("shell32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]
    public static extern void SHChangeNotify(int eventId,uint flags,string path,IntPtr other);
  }
}
