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

        const noMatches = []; // Separate list for students with no match

        while (unmatchedStudents.length > 0) {
            const student = unmatchedStudents.shift();
            const prefs = Object.entries(studentPreferences[student] || {}).sort((a, b) => a[1] - b[1]);
            let matched = false; // Flag to track if the student has been matched

            for (const [faculty, _] of prefs) {
                if (facultyPartners[faculty].length < facultyCapacities[faculty]) {
                    // Faculty has capacity; match student
                    facultyPartners[faculty].push(student);
                    studentPartners[student] = faculty;
                    matched = true; // Mark as matched
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
                            matched = true; // Mark as matched
                            break;
                        }
                    }
                }
            }
            // If no match was found for the current student, add to noMatches
            if (!matched) {
                noMatches.push(student); // Add unmatched student to the noMatches list
            }
        }

        // Assign backups only from the noMatches (unmatched students)
        const backups = {};
        let remainingUnmatchedStudents = [...noMatches]; // Ensure we work with the current unmatched students

       // Go through each faculty and assign one unmatched student as a backup
        for (const faculty of Object.keys(facultyPartners)) {
            if (faculty && faculty.trim() !== '' && faculty !== 'undefined') {
                let assignedBackup = null;

                // Step 1: Unmatched students propose to the faculty based on faculty preferences
                let sortedPreferredStudents = remainingUnmatchedStudents
                    .filter(student => facultyPreferences[faculty]?.[student] !== undefined && !studentPartners[student])  // Ensure student is not matched
                    .sort((a, b) => facultyPreferences[faculty][a] - facultyPreferences[faculty][b]);

                // Step 2: If no faculty-preferred students are found, check student preferences for the faculty
                if (sortedPreferredStudents.length === 0) {
                    sortedPreferredStudents = remainingUnmatchedStudents
                        .filter(student => studentPreferences[student]?.[faculty] !== undefined && !studentPartners[student])  // Ensure student is not matched
                        .sort((a, b) => studentPreferences[a][faculty] - studentPreferences[b][faculty]);
                }

                // Step 3: Assign the best available unmatched student to the faculty
                if (sortedPreferredStudents.length > 0) {
                    assignedBackup = sortedPreferredStudents[0];
                }

                // If no student can be assigned, assign "None"
                backups[faculty] = assignedBackup || "None";
            }
        }

      // Return the final results with updated backups
        return { studentPartners, facultyPartners, backups, noMatches };

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

        const { studentPartners, facultyPartners, backups } = galeShapley(
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

        // Display backups
        const backupsTable = document.getElementById('backupsTable').getElementsByTagName('tbody')[0];
        backupsTable.innerHTML = '';

        // Iterate over the backups object, ensuring no undefined faculty entries
        for (const [faculty, backup] of Object.entries(backups)) {
            if (faculty && faculty.trim() !== '' && faculty !== 'undefined') { // Check for valid and non-empty faculty
                const row = backupsTable.insertRow();
                row.insertCell(0).textContent = faculty;
                row.insertCell(1).textContent = backup || "None";
            } else {
                console.log("Skipping invalid faculty:", faculty); // Log any invalid faculty names
            }
        }

        // Show the results section
        document.getElementById('results').style.display = 'block';
    });

    document.getElementById('details').addEventListener('click', () => {
        const detailsButton = document.getElementById('details');
        const detailsColumn = document.getElementById('detailstable');

        if (detailsButton.textContent === 'Show Details') {
            detailsButton.textContent = 'Hide Details';
            detailsColumn.style.display = 'table-cell';

            // Get the matched results
            const matchesTable = document.getElementById('matchesTable').getElementsByTagName('tbody')[0];
            const studentPartners = {};
            const facultyPartners = {};

            // Reconstruct studentPartners and facultyPartners objects
            for (const row of matchesTable.rows) {
                const faculty = row.cells[0].textContent;
                const students = row.cells[1].textContent.split(', ');
                facultyPartners[faculty] = students;
                for (const student of students) {
                    studentPartners[student] = faculty;
                }
            }

            // Add details column to matches table
            for (const row of matchesTable.rows) {
                if (row.cells.length < 3) {
                    const detailsCell = row.insertCell(2);
                    detailsCell.innerHTML = '';
                    const faculty = row.cells[0].textContent;
                    const students = row.cells[1].textContent.split(', ');
                    for (const student of students) {
                        const studentScore = studentPreferences[student][faculty];
                        const facultyScore = facultyPreferences[faculty][student];
                        const details = `${faculty}: ${facultyScore}<br>${student}: ${studentScore}`;
                        const div = document.createElement('div');
                        div.innerHTML = details; // Use innerHTML instead of textContent
                        detailsCell.appendChild(div);
                    }
                }
                row.cells[2].style.display = 'block';
            }
        } else {
            detailsButton.textContent = 'Show Details';
            detailsColumn.style.display = 'none';

            // Hide details column
            const matchesTable = document.getElementById('matchesTable').getElementsByTagName('tbody')[0];
            for (const row of matchesTable.rows) {
                if (row.cells.length > 2) {
                    row.cells[2].style.display = 'none';
                }
            }
        }
    });

});
