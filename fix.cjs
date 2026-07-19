const fs = require('fs');
const file = 'src/components/UploadZone.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `    } finally {
      setIsLoading(false);
      setProgressStep('');
      setProgressPercent(0);
    }`;

code = code.replace(target, target + "\n  };");
fs.writeFileSync(file, code);
