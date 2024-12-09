document.addEventListener('DOMContentLoaded', function() {
    let studentPreferences = {};
    let facultyPreferences = {};
    let facultyCapacities = {};

    const parseExcel = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(workbook);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const parseSheet = (sheet) => {
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = rows.shift();
        return rows.reduce((acc, row) => {
            const name = row[0];
            acc[name] = headers.slice(1).reduce((prefs, header, index) => {
                if (row[index + 1] !== undefined && row[index + 1] !== null) {
                    prefs[header] = row[index + 1];
                }
                return prefs;
            }, {});
            return acc;
        }, {});
    };

    const parseCapacities = (sheet) => {
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        rows.shift();
        return rows.reduce((acc, row) => {
            acc[row[0]] = row[1];
            return acc;
        }, {});
    };

    const galeShapley = (students, faculty, studentPreferences, facultyPreferences, facultyCapacities) => {
        const unmatchedStudents = [...students];
        const facultyPartners = Object.fromEntries(faculty.map(f => [f, []]));
        const studentPartners = Object.fromEntries(students.map(s => [s, null]));

        while (unmatchedStudents.length > 0) {
            const student = unmatchedStudents.shift();
            const prefs = Object.entries(studentPreferences[student] || {}).sort((a, b) => a[1] - b[1]);

            for (const [faculty, _] of prefs) {
                if (facultyPartners[faculty].length < facultyCapacities[faculty]) {
                    // Faculty has capacity; match student
                    facultyPartners[faculty].push(student);
                    studentPartners[student] = faculty;
                    break;
                } else {
                    const currentStudents = facultyPartners[faculty];
                    const facultyPref = facultyPreferences[faculty];

                    // Find the least preferred student among current matches
                    let leastPreferredStudent = currentStudents[0];
                    let leastPreferredScore = facultyPref[leastPreferredStudent] || Infinity;
                    for (const currentStudent of currentStudents) {
                        const score = facultyPref[currentStudent] || Infinity;
                        if (score > leastPreferredScore) {
                            leastPreferredStudent = currentStudent;
                            leastPreferredScore = score;
                        }
                    }

                    const newStudentScore = facultyPref[student] || Infinity;

                    if (newStudentScore < leastPreferredScore) {
                        // Replace the least preferred student
                        facultyPartners[faculty] = facultyPartners[faculty].filter(s => s !== leastPreferredStudent);
                        facultyPartners[faculty].push(student);
                        studentPartners[leastPreferredStudent] = null;
                        unmatchedStudents.push(leastPreferredStudent);
                        studentPartners[student] = faculty;
                        break;
                    } else if (newStudentScore === leastPreferredScore) {
                        // Tie-breaking logic: compare students' preferences
                        const currentStudentPref = studentPreferences[leastPreferredStudent][faculty] || Infinity;
                        const newStudentPref = studentPreferences[student][faculty] || Infinity;

                        if (newStudentPref < currentStudentPref) {
                            // Replace based on student's preference
                            facultyPartners[faculty] = facultyPartners[faculty].filter(s => s !== leastPreferredStudent);
                            facultyPartners[faculty].push(student);
                            studentPartners[leastPreferredStudent] = null;
                            unmatchedStudents.push(leastPreferredStudent);
                            studentPartners[student] = faculty;
                            break;
                        }
                    }
                }
            }
        }

        return { studentPartners, facultyPartners };
    };

    document.getElementById('fileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const workbook = await parseExcel(file);
        studentPreferences = parseSheet(workbook.Sheets[workbook.SheetNames[0]]);
        facultyPreferences = parseSheet(workbook.Sheets[workbook.SheetNames[1]]);
        facultyCapacities = parseCapacities(workbook.Sheets[workbook.SheetNames[2]]);

        document.getElementById('runAlgorithm').disabled = false;
    });

    document.getElementById('runAlgorithm').addEventListener('click', () => {
        const students = Object.keys(studentPreferences);
        const faculty = Object.keys(facultyPreferences);

        const { studentPartners, facultyPartners } = galeShapley(
            students,
            faculty,
            studentPreferences,
            facultyPreferences,
            facultyCapacities
        );

        // Clear previous results
        const matchesTable = document.getElementById('matchesTable').getElementsByTagName('tbody')[0];
        matchesTable.innerHTML = '';

        for (const [faculty, matchedStudents] of Object.entries(facultyPartners)) {
            if (matchedStudents.length > 0) {
                const row = matchesTable.insertRow();
                row.insertCell(0).textContent = faculty;
                row.insertCell(1).textContent = matchedStudents.join(", ");
            }
        }

        // Clear unmatched students table
        const unmatchedTable = document.getElementById('unmatchedTable').getElementsByTagName('tbody')[0];
        unmatchedTable.innerHTML = '';

        const unmatched = students.filter(s => !studentPartners[s]);
        unmatched.forEach(student => {
            const row = unmatchedTable.insertRow();
            row.insertCell(0).textContent = student;
        });

        // Show the results section
        document.getElementById('results').style.display = 'block';
    });
});
