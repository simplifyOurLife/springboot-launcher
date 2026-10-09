package local.launcher.example;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 可公开的最小验收工程，不包含业务依赖或秘密配置。 */
@SpringBootApplication
@EnableScheduling
@RestController
public class DemoApplication {
    private static final Logger LOG = LoggerFactory.getLogger(DemoApplication.class);
    private final AtomicLong ticks = new AtomicLong();

    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        LOG.info("收到本机演示请求，服务运行正常");
        return Map.of("message", "服务运行正常", "time", LocalDateTime.now().toString());
    }

    @Scheduled(fixedRate = 5000)
    public void printDemoLog() {
        long count = ticks.incrementAndGet();
        LOG.info("中文实时日志，第 {} 次输出；<b>这段文字应原样显示</b>", count);
        // 仅为验收明确区分 stderr 与普通日志，不表示真实业务异常。
        if (count % 3 == 0) {
            System.err.println("演示标准错误输出：用于检查 stderr 采集");
        }
    }
}
